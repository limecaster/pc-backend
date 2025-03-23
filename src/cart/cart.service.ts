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
import { Neo4jConfigService } from '../../config/neo4j.config';

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
    /**
     * Runs a Neo4j query to check compatibility.
     * @param session - Neo4j session.
     * @param query - Cypher query string.
     * @param params - Query parameters.
     * @returns Promise resolving to a boolean indicating compatibility.
     */

    private async runNeo4jQuery(
        session: any,
        query: string,
        params: { [key: string]: any },
    ): Promise<any> {
        const result = await session.run(query, params);
        return result;
    }

    async getCart(userId: number): Promise<CartResponseDto> {
        // Validate userId
        if (!userId) {
            throw new BadRequestException('Valid customer ID is required');
        }

        // Find or create cart
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

        // Calculate total price and format response
        return this.formatCartResponse(cart);
    }

    async addToCart(
        userId: number,
        productId: string,
        quantity: number = 1,
    ): Promise<CartResponseDto> {
        // Validate userId
        if (!userId) {
            throw new BadRequestException('Valid customer ID is required');
        }

        // Check if product exists
        const product = await this.productRepository.findOne({
            where: { id: productId },
        });
        if (!product) {
            throw new NotFoundException('Product not found');
        }

        // Find or create cart
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

        // Check if product is already in cart
        const existingItem = cart.items.find(
            (item) => item.productId === productId,
        );

        if (existingItem) {
            // Update quantity if product already exists
            existingItem.quantity += quantity;
            existingItem.subPrice = product.price * existingItem.quantity;
            await this.cartItemRepository.save(existingItem);
        } else {
            // Add new item to cart
            const newItem = this.cartItemRepository.create({
                cartId: cart.id,
                productId: product.id,
                quantity: quantity,
                subPrice: product.price * quantity,
            });
            await this.cartItemRepository.save(newItem);
            cart.items.push(newItem);
        }

        // Refresh cart to get updated items
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
        // Validate userId
        if (!userId) {
            throw new BadRequestException('Valid customer ID is required');
        }

        // Check if customer exists in database first
        const customer = await this.customerRepository.findOne({
            where: { id: userId },
        });

        if (!customer) {
            this.logger.error(
                `Customer with ID ${userId} not found in database`,
            );
            throw new NotFoundException(`Customer with ID ${userId} not found`);
        }

        this.logger.debug(`Found customer: ${customer.id} (${customer.email})`);

        // Find or create cart
        try {
            let cart = await this.cartRepository.findOne({
                where: { customerId: userId },
                relations: ['items', 'items.product'],
            });

            if (!cart) {
                this.logger.debug(`Creating new cart for customer ${userId}`);
                cart = this.cartRepository.create({
                    customerId: userId,
                    status: 'active',
                    items: [],
                });
                await this.cartRepository.save(cart);

                // Refresh cart after creation
                cart = await this.cartRepository.findOne({
                    where: { customerId: userId },
                    relations: ['items', 'items.product'],
                });

                if (!cart) {
                    throw new Error('Failed to create cart');
                }
            }

            // Process each product
            for (const productId of productIds) {
                try {
                    const product = await this.productRepository.findOne({
                        where: { id: productId },
                    });
                    if (!product) {
                        this.logger.warn(
                            `Product ${productId} not found, skipping`,
                        );
                        continue;
                    }

                    const existingItem = cart.items.find(
                        (item) => item.productId === productId,
                    );

                    if (existingItem) {
                        // Update quantity if product already exists
                        existingItem.quantity += 1;
                        existingItem.subPrice =
                            product.price * existingItem.quantity;
                        await this.cartItemRepository.save(existingItem);
                    } else {
                        // Add new item to cart
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
                        `Error adding product ${productId} to cart:`,
                        error,
                    );
                }
            }

            // Refresh cart to get updated items
            cart = await this.cartRepository.findOne({
                where: { id: cart.id },
                relations: ['items', 'items.product'],
            });

            return this.formatCartResponse(cart);
        } catch (error) {
            if (error instanceof QueryFailedError) {
                this.logger.error(`Database error: ${error.message}`);
                // Check if it's a foreign key constraint error
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
        this.logger.debug(
            `Updating cart item for user ${userId}, product ${productId}, quantity ${quantity}`,
        );

        // Validate userId
        if (!userId) {
            throw new BadRequestException('Valid customer ID is required');
        }

        if (quantity < 1) {
            throw new BadRequestException('Quantity must be at least 1');
        }

        // Check if product exists
        const product = await this.productRepository.findOne({
            where: { id: productId },
        });
        if (!product) {
            throw new NotFoundException(
                `Product with ID ${productId} not found`,
            );
        }

        // Find cart
        let cart = await this.cartRepository.findOne({
            where: { customerId: userId },
            relations: ['items', 'items.product'],
        });

        if (!cart) {
            throw new NotFoundException(`Cart for user ${userId} not found`);
        }

        // Find item in cart
        const existingItem = cart.items.find(
            (item) => item.productId === productId,
        );
        if (!existingItem) {
            throw new NotFoundException(
                `Item with product ID ${productId} not found in cart`,
            );
        }

        // Update quantity and subprice
        existingItem.quantity = quantity;
        existingItem.subPrice = parseFloat(product.price.toString()) * quantity;
        await this.cartItemRepository.save(existingItem);

        // Refresh cart to get updated items
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
        this.logger.debug(
            `Removing item from cart for user ${userId}, product ${productId}`,
        );

        // Validate userId
        if (!userId) {
            throw new BadRequestException('Valid customer ID is required');
        }

        // Find cart
        let cart = await this.cartRepository.findOne({
            where: { customerId: userId },
            relations: ['items', 'items.product'],
        });

        if (!cart) {
            throw new NotFoundException(`Cart for user ${userId} not found`);
        }

        // Find the item to remove
        const itemToRemove = cart.items.find(
            (item) => item.productId === productId,
        );
        if (!itemToRemove) {
            throw new NotFoundException(
                `Item with product ID ${productId} not found in cart`,
            );
        }

        // Remove the item
        await this.cartItemRepository.remove(itemToRemove);

        // Refresh cart to get updated items
        cart = await this.cartRepository.findOne({
            where: { id: cart.id },
            relations: ['items', 'items.product'],
        });

        return this.formatCartResponse(cart);
    }

    private async formatCartResponse(cart: Cart): Promise<CartResponseDto> {
        // Gather all product IDs to fetch images in bulk
        const productIds = cart.items.map((item) => item.productId);

        // Fetch image URLs from Neo4j in bulk if there are products
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
                // Create a map of product ID to image URL
                for (const record of result.records) {
                    const id = record.get('id');
                    const imageUrl = record.get('imageUrl');
                    if (id && imageUrl) {
                        imageUrlMap.set(id, imageUrl);
                    }
                }

                this.logger.debug(
                    `Fetched ${imageUrlMap.size} images from Neo4j`,
                );
            } catch (error) {
                this.logger.error(
                    `Error fetching images from Neo4j: ${error.message}`,
                    error.stack,
                );
                // Continue with the default image URLs if Neo4j query fails
            }
        }

        return {
            id: cart.id,
            status: cart.status,
            items: await Promise.all(
                cart.items.map(async (item) => {
                    // Get image URL from Neo4j map or use default/fallback
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
