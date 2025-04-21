import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { Product } from '../product/product.entity';
import { CartResponseDto } from './dto/cart.dto';
import { Customer } from '../customer/customer.entity';
import { Neo4jConfigService } from '../config/neo4j.config';

@Injectable()
export class CartService {
    private readonly logger = new Logger(CartService.name);

    constructor(
        @InjectRepository(Cart)
        private cartRepository: Repository<Cart>,
        @InjectRepository(CartItem)
        private cartItemRepository: Repository<CartItem>,
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
        @InjectRepository(Customer)
        private customerRepository: Repository<Customer>,
        private neo4jConfigService: Neo4jConfigService,
    ) {}

    private async runNeo4jQuery(
        session: any,
        query: string,
        params: { [key: string]: any },
    ): Promise<any> {
        try {
            const result = await session.run(query, params);
            return result;
        } catch (error) {
            this.logger.error(
                `Neo4j query failed: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }

    async getCart(userId: number): Promise<CartResponseDto> {
        if (!userId) {
            throw new BadRequestException('Valid customer ID is required');
        }

        // Ensure the customer exists
        const customer = await this.customerRepository.findOne({ where: { id: userId } });
        if (!customer) {
            this.logger.error(`Customer with ID ${userId} not found`);
            throw new NotFoundException(`Customer with ID ${userId} not found`);
        }

        let cart = await this.cartRepository.findOne({
            where: { customerId: userId },
            relations: ['items', 'items.product'],
        });

        if (!cart) {
            cart = this.cartRepository.create({
                customerId: userId,
                status: 'active',
                items: [],
            });
            await this.cartRepository.save(cart);
        }

        return this.formatCartResponse(cart);
    }

    async addToCart(
        userId: number,
        productId: string,
        quantity: number = 1,
    ): Promise<CartResponseDto> {
        if (!userId) {
            throw new BadRequestException('Valid customer ID is required');
        }

        // Ensure the customer exists
        const customer = await this.customerRepository.findOne({ where: { id: userId } });
        if (!customer) {
            this.logger.error(`Customer with ID ${userId} not found`);
            throw new NotFoundException(`Customer with ID ${userId} not found`);
        }

        const product = await this.productRepository.findOne({
            where: { id: productId },
        });
        if (!product) {
            throw new NotFoundException('Product not found');
        }

        let cart = await this.cartRepository.findOne({
            where: { customerId: userId },
            relations: ['items', 'items.product'],
        });

        if (!cart) {
            cart = this.cartRepository.create({
                customerId: userId,
                status: 'active',
                items: [],
            });
            await this.cartRepository.save(cart);
        }

        const existingItem = cart.items.find(
            (item) => item.productId === productId,
        );

        if (existingItem) {
            existingItem.quantity += quantity;
            existingItem.subPrice = parseFloat(product.price.toString()) * existingItem.quantity;
            await this.cartItemRepository.save(existingItem);
        } else {
            const newItem = this.cartItemRepository.create({
                cartId: cart.id,
                productId: product.id,
                quantity: quantity,
                subPrice: product.price * quantity,
            });
            await this.cartItemRepository.save(newItem);
            cart.items.push(newItem);
        }

        cart = await this.cartRepository.findOne({
            where: { id: cart.id },
            relations: ['items', 'items.product'],
        });

        return this.formatCartResponse(cart);
    }

    async addMultipleToCart(
        userId: number,
        productIds: string[],
    ): Promise<CartResponseDto> {
        if (!userId) {
            throw new BadRequestException('Valid customer ID is required');
        }

        const customer = await this.customerRepository.findOne({
            where: { id: userId },
        });

        if (!customer) {
            this.logger.error(`Customer with ID ${userId} not found`);
            throw new NotFoundException(`Customer with ID ${userId} not found`);
        }

        try {
            let cart = await this.cartRepository.findOne({
                where: { customerId: userId },
                relations: ['items', 'items.product'],
            });

            if (!cart) {
                cart = this.cartRepository.create({
                    customerId: userId,
                    status: 'active',
                    items: [],
                });
                await this.cartRepository.save(cart);

                cart = await this.cartRepository.findOne({
                    where: { customerId: userId },
                    relations: ['items', 'items.product'],
                });

                if (!cart) {
                    this.logger.error(
                        `Failed to create cart for user ${userId}`,
                    );
                    throw new Error('Failed to create cart');
                }
            }

            for (const productId of productIds) {
                try {
                    const product = await this.productRepository.findOne({
                        where: { id: productId },
                    });
                    if (!product) {
                        continue;
                    }

                    const existingItem = cart.items.find(
                        (item) => item.productId === productId,
                    );

                    if (existingItem) {
                        existingItem.quantity += 1;
                        existingItem.subPrice =
                            product.price * existingItem.quantity;
                        await this.cartItemRepository.save(existingItem);
                    } else {
                        const newItem = this.cartItemRepository.create({
                            cartId: cart.id,
                            productId: product.id,
                            quantity: 1,
                            subPrice: product.price,
                        });
                        await this.cartItemRepository.save(newItem);
                        cart.items.push(newItem);
                    }
                } catch (error) {
                    this.logger.error(
                        `Error adding product ${productId} to cart: ${error.message}`,
                    );
                }
            }

            cart = await this.cartRepository.findOne({
                where: { id: cart.id },
                relations: ['items', 'items.product'],
            });

            return this.formatCartResponse(cart);
        } catch (error) {
            if (error instanceof QueryFailedError) {
                this.logger.error(`Database error: ${error.message}`);
                if (error.message.includes('violates foreign key constraint')) {
                    throw new BadRequestException(
                        'Invalid customer ID. Please contact support.',
                    );
                }
            }
            throw error;
        }
    }

    async updateCartItem(
        userId: number,
        productId: string,
        quantity: number,
    ): Promise<CartResponseDto> {
        if (!userId) {
            throw new BadRequestException('Valid customer ID is required');
        }

        if (quantity < 1) {
            throw new BadRequestException('Quantity must be at least 1');
        }

        const product = await this.productRepository.findOne({
            where: { id: productId },
        });
        if (!product) {
            throw new NotFoundException(
                `Product with ID ${productId} not found`,
            );
        }

        let cart = await this.cartRepository.findOne({
            where: { customerId: userId },
            relations: ['items', 'items.product'],
        });

        if (!cart) {
            throw new NotFoundException(`Cart for user ${userId} not found`);
        }

        const existingItem = cart.items.find(
            (item) => item.productId === productId,
        );
        if (!existingItem) {
            throw new NotFoundException(
                `Item with product ID ${productId} not found in cart`,
            );
        }

        existingItem.quantity = quantity;
        existingItem.subPrice = parseFloat(product.price.toString()) * quantity;
        await this.cartItemRepository.save(existingItem);

        cart = await this.cartRepository.findOne({
            where: { id: cart.id },
            relations: ['items', 'items.product'],
        });

        return this.formatCartResponse(cart);
    }

    async removeCartItem(
        userId: number,
        productId: string,
    ): Promise<CartResponseDto> {
        if (!userId) {
            throw new BadRequestException('Valid customer ID is required');
        }

        let cart = await this.cartRepository.findOne({
            where: { customerId: userId },
            relations: ['items', 'items.product'],
        });

        if (!cart) {
            throw new NotFoundException(`Cart for user ${userId} not found`);
        }

        const itemToRemove = cart.items.find(
            (item) => item.productId === productId,
        );
        if (!itemToRemove) {
            throw new NotFoundException(
                `Item with product ID ${productId} not found in cart`,
            );
        }

        await this.cartItemRepository.remove(itemToRemove);

        cart = await this.cartRepository.findOne({
            where: { id: cart.id },
            relations: ['items', 'items.product'],
        });

        return this.formatCartResponse(cart);
    }

    private async formatCartResponse(cart: Cart): Promise<CartResponseDto> {
        const productIds = cart.items.map((item) => item.productId);

        const imageUrlMap = new Map<string, string>();

        if (productIds.length > 0) {
            try {
                const query = `
                    MATCH (p)
                    WHERE p.id IN $productIds
                    RETURN p.id as id, p.imageUrl as imageUrl
                `;

                const result = await this.runNeo4jQuery(
                    this.neo4jConfigService.getDriver().session(),
                    query,
                    { productIds },
                );
                for (const record of result.records) {
                    const id = record.get('id');
                    const imageUrl = record.get('imageUrl');
                    if (id && imageUrl) {
                        imageUrlMap.set(id, imageUrl);
                    }
                }
            } catch (error) {
                this.logger.error(
                    `Error fetching images from Neo4j: ${error.message}`,
                );
            }
        }

        return {
            id: cart.id,
            status: cart.status,
            items: await Promise.all(
                cart.items.map(async (item) => {
                    let imageUrl =
                        imageUrlMap.get(item.productId) ||
                        '/images/image-placeholder.webp';
                    return {
                        id: item.id,
                        productId: item.productId,
                        productName: item.product?.name || 'Unknown Product',
                        imageUrl,
                        quantity: item.quantity,
                        price: parseFloat(
                            item.product?.price.toString() || '0',
                        ),
                        subPrice: parseFloat(item.subPrice.toString()),
                    };
                }),
            ),
            totalPrice: cart.items.reduce(
                (sum, item) => sum + parseFloat(item.subPrice.toString()),
                0,
            ),
        };
    }
}
