import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { Discount } from './discount.entity';
import {
    CreateDiscountDto,
    UpdateDiscountDto,
    DiscountResponseDto,
    DiscountStatisticsDto,
} from './dto/discount.dto';

@Injectable()
export class DiscountService {
    private readonly logger = new Logger(DiscountService.name);

    constructor(
        @InjectRepository(Discount)
        private discountRepository: Repository<Discount>,
    ) {}

    // Helper method to convert Discount entity to DTO
    private mapToDto(discount: Discount): DiscountResponseDto {
        return {
            id: discount.id,
            discountCode: discount.discountCode,
            discountName: discount.discountName,
            discountDescription: discount.discountDescription,
            startDate: discount.startDate.toISOString(),
            endDate: discount.endDate.toISOString(),
            discountAmount: Number(discount.discountAmount),
            type: discount.type,
            status: discount.status,
            // Add new targeting fields
            targetType: discount.targetType || 'all',
            productIds: discount.productIds,
            categoryNames: discount.categoryNames,
            customerIds: discount.customerIds,
            minOrderAmount: discount.minOrderAmount,
            isFirstPurchaseOnly: discount.isFirstPurchaseOnly || false,
            isAutomatic: discount.isAutomatic || false,
            createdAt: discount.createdAt,
            updatedAt: discount.updatedAt,
        };
    }

    async findAll(): Promise<DiscountResponseDto[]> {
        const discounts = await this.discountRepository.find();

        // Update statuses based on current date
        const today = new Date();
        const updatedDiscounts = discounts.map((discount) => {
            if (discount.status !== 'inactive' && discount.endDate < today) {
                discount.status = 'expired';
            }
            return this.mapToDto(discount);
        });

        return updatedDiscounts;
    }

    async findOne(id: number): Promise<DiscountResponseDto> {
        const discount = await this.discountRepository.findOne({
            where: { id },
        });
        if (!discount) {
            throw new NotFoundException(`Discount with ID ${id} not found`);
        }

        // Update status based on current date
        const today = new Date();
        if (discount.status !== 'inactive' && discount.endDate < today) {
            discount.status = 'expired';
        }

        return this.mapToDto(discount);
    }

    async findByCode(code: string): Promise<DiscountResponseDto> {
        const discount = await this.discountRepository.findOne({
            where: { discountCode: code },
        });

        if (!discount) {
            throw new NotFoundException(`Discount with code ${code} not found`);
        }

        // Update status based on current date
        const today = new Date();
        if (discount.status !== 'inactive' && discount.endDate < today) {
            discount.status = 'expired';
            await this.discountRepository.save(discount);
        }

        return this.mapToDto(discount);
    }

    async create(
        createDiscountDto: CreateDiscountDto,
    ): Promise<DiscountResponseDto> {
        // Check if discount code already exists
        const existingDiscount = await this.discountRepository.findOne({
            where: { discountCode: createDiscountDto.discountCode },
        });

        if (existingDiscount) {
            throw new ConflictException(
                `Discount code ${createDiscountDto.discountCode} already exists`,
            );
        }

        // Validate dates
        const startDate = new Date(createDiscountDto.startDate);
        const endDate = new Date(createDiscountDto.endDate);
        const today = new Date();

        if (endDate < startDate) {
            throw new BadRequestException('End date must be after start date');
        }

        // For percentage type, ensure amount is between 0 and 100
        if (
            createDiscountDto.type === 'percentage' &&
            (createDiscountDto.discountAmount < 0 ||
                createDiscountDto.discountAmount > 100)
        ) {
            throw new BadRequestException(
                'Percentage discount must be between 0 and 100',
            );
        }

        // Validate targeting fields based on targetType
        if (createDiscountDto.targetType) {
            this.validateTargetFields(createDiscountDto);
        }

        const discount = this.discountRepository.create({
            ...createDiscountDto,
            status: createDiscountDto.status || 'active',
            targetType: createDiscountDto.targetType || 'all',
            isFirstPurchaseOnly: createDiscountDto.isFirstPurchaseOnly || false,
            startDate, // Use Date object
            endDate, // Use Date object
        });

        const savedDiscount = await this.discountRepository.save(discount);

        return this.mapToDto(savedDiscount);
    }

    async update(
        id: number,
        updateDiscountDto: UpdateDiscountDto,
    ): Promise<DiscountResponseDto> {
        const discount = await this.discountRepository.findOne({
            where: { id },
        });

        if (!discount) {
            throw new NotFoundException(`Discount with ID ${id} not found`);
        }

        // Prevent changing discount code
        if (
            updateDiscountDto.discountCode &&
            updateDiscountDto.discountCode !== discount.discountCode
        ) {
            throw new BadRequestException('Discount code cannot be changed');
        }

        // Validate dates
        let startDate = discount.startDate;
        let endDate = discount.endDate;

        if (updateDiscountDto.startDate) {
            startDate = new Date(updateDiscountDto.startDate);
        }

        if (updateDiscountDto.endDate) {
            endDate = new Date(updateDiscountDto.endDate);
        }

        if (endDate < startDate) {
            throw new BadRequestException('End date must be after start date');
        }

        // For percentage type, ensure amount is between 0 and 100
        if (
            updateDiscountDto.type === 'percentage' &&
            updateDiscountDto.discountAmount !== undefined &&
            (updateDiscountDto.discountAmount < 0 ||
                updateDiscountDto.discountAmount > 100)
        ) {
            throw new BadRequestException(
                'Percentage discount must be between 0 and 100',
            );
        }

        // Validate targeting fields if targetType is being updated
        if (updateDiscountDto.targetType) {
            this.validateTargetFields({
                ...discount,
                ...updateDiscountDto,
                targetType: updateDiscountDto.targetType,
                productIds: updateDiscountDto.productIds || discount.productIds,
                categoryNames:
                    updateDiscountDto.categoryNames || discount.categoryNames,
                customerIds:
                    updateDiscountDto.customerIds || discount.customerIds,
            });
        }

        // Update the discount
        Object.assign(discount, {
            ...updateDiscountDto,
            startDate,
            endDate,
        });

        const updatedDiscount = await this.discountRepository.save(discount);

        return this.mapToDto(updatedDiscount);
    }

    async remove(id: number): Promise<{ success: boolean; message: string }> {
        const discount = await this.findOne(id);
        await this.discountRepository.delete(id);
        return {
            success: true,
            message: `Discount ${discount.discountCode} has been deleted`,
        };
    }

    async getStatistics(): Promise<DiscountStatisticsDto> {
        try {
            // Get total usage from all discounts
            const discounts = await this.discountRepository.find({
                order: { usageCount: 'DESC' },
            });

            const totalUsage = discounts.reduce(
                (sum, discount) => sum + discount.usageCount,
                0,
            );
            const totalSavings = discounts.reduce(
                (sum, discount) =>
                    sum + Number(discount.totalSavingsAmount || 0),
                0,
            );

            // Get most used discounts (top 5)
            const mostUsedDiscounts = discounts
                .filter((discount) => discount.usageCount > 0)
                .slice(0, 5)
                .map((discount) => ({
                    discountCode: discount.discountCode,
                    usageCount: discount.usageCount,
                }));

            return {
                totalUsage,
                totalSavings,
                mostUsedDiscounts,
            };
        } catch (error) {
            this.logger.error(
                `Error getting discount statistics: ${error.message}`,
            );
            return {
                totalUsage: 0,
                totalSavings: 0,
                mostUsedDiscounts: [],
            };
        }
    }

    // Add a new method to validate the target fields
    private validateTargetFields(discountDto: any): void {
        const { targetType, productIds, categoryNames, customerIds } =
            discountDto;

        // Check if appropriate target IDs are provided based on targetType
        switch (targetType) {
            case 'products':
                if (
                    !productIds ||
                    !Array.isArray(productIds) ||
                    productIds.length === 0
                ) {
                    throw new BadRequestException(
                        'Products must be specified when target type is "products"',
                    );
                }
                break;
            case 'categories':
                if (
                    !categoryNames ||
                    !Array.isArray(categoryNames) ||
                    categoryNames.length === 0
                ) {
                    throw new BadRequestException(
                        'Categories must be specified when target type is "categories"',
                    );
                }
                break;
            case 'customers':
                if (
                    !customerIds ||
                    !Array.isArray(customerIds) ||
                    customerIds.length === 0
                ) {
                    throw new BadRequestException(
                        'Customers must be specified when target type is "customers"',
                    );
                }
                break;
        }
    }

    // Add a new method to get automatic discounts
    async getAutomaticDiscounts(options?: {
        productIds?: string[];
        categoryNames?: string[];
        customerId?: string;
        isFirstPurchase?: boolean;
        orderAmount?: number;
    }): Promise<DiscountResponseDto[]> {
        try {
            const today = new Date();

            // Find all active automatic discounts that are within the valid date range
            const queryBuilder = this.discountRepository
                .createQueryBuilder('discount')
                .where('discount.status = :status', { status: 'active' })
                .andWhere('discount.isAutomatic = :isAutomatic', {
                    isAutomatic: true,
                })
                .andWhere('discount.startDate <= :today', { today })
                .andWhere('discount.endDate >= :today', { today });

            const allAutomaticDiscounts = await queryBuilder.getMany();

            if (!allAutomaticDiscounts.length) {
                return [];
            }

            // Filter discounts based on options
            const applicableDiscounts = allAutomaticDiscounts.filter(
                (discount) => {
                    // Check minimum order amount
                    if (
                        discount.minOrderAmount &&
                        options?.orderAmount &&
                        options.orderAmount < discount.minOrderAmount
                    ) {
                        return false;
                    }

                    // Check first purchase restriction
                    if (
                        discount.isFirstPurchaseOnly &&
                        options?.isFirstPurchase === false
                    ) {
                        return false;
                    }

                    // Check target restrictions
                    if (discount.targetType !== 'all') {
                        switch (discount.targetType) {
                            case 'products':
                                if (
                                    !options?.productIds ||
                                    !discount.productIds?.some((id) =>
                                        options.productIds.includes(id),
                                    )
                                ) {
                                    return false;
                                }
                                break;

                            case 'categories':
                                if (
                                    !options?.categoryNames ||
                                    !discount.categoryNames?.some((cat) =>
                                        options.categoryNames.includes(cat),
                                    )
                                ) {
                                    return false;
                                }
                                break;

                            case 'customers':
                                if (
                                    !options?.customerId ||
                                    !discount.customerIds?.includes(
                                        options.customerId,
                                    )
                                ) {
                                    return false;
                                }
                                break;
                        }
                    }

                    return true;
                },
            );

            return applicableDiscounts.map((discount) =>
                this.mapToDto(discount),
            );
        } catch (error) {
            this.logger.error(
                `Error getting automatic discounts: ${error.message}`,
            );
            return [];
        }
    }

    // Add method to get best discount for multiple options
    async getBestDiscount(
        discounts: Discount[],
        productPrice: number,
    ): Promise<{
        bestDiscount: Discount | null;
        discountAmount: number;
    }> {
        if (!discounts.length) {
            return { bestDiscount: null, discountAmount: 0 };
        }

        // Calculate actual discount amount for each discount
        const discountsWithAmount = discounts.map((discount) => {
            let amount = 0;
            if (discount.type === 'percentage') {
                amount = (productPrice * Number(discount.discountAmount)) / 100;
            } else {
                amount = Math.min(
                    Number(discount.discountAmount),
                    productPrice,
                );
            }
            return { discount, amount };
        });

        // Sort by discount amount descending
        discountsWithAmount.sort((a, b) => b.amount - a.amount);

        // Return the best discount
        return {
            bestDiscount: discountsWithAmount[0].discount,
            discountAmount: discountsWithAmount[0].amount,
        };
    }

    // Add a new helper method to sum multiple automatic discounts
    async getTotalAutoDiscountAmount(
        discounts: Discount[],
        orderAmount: number,
    ): Promise<number> {
        let total = 0;
        for (const discount of discounts) {
            let amount = 0;
            if (discount.type === 'percentage') {
                amount = (orderAmount * Number(discount.discountAmount)) / 100;
            } else {
                amount = Math.min(Number(discount.discountAmount), orderAmount);
            }
            total += amount;
        }
        return total;
    }

    // Update the validateDiscount method to return comparison data
    async validateDiscount(
        code: string,
        orderAmount: number,
        productIds?: string[],
        productPrices?: Record<string, number>, // Add this parameter to match the controller call
    ): Promise<{
        valid: boolean;
        discount?: DiscountResponseDto;
        discountAmount?: number;
        automaticDiscounts?: DiscountResponseDto[];
        automaticDiscountAmount?: number;
        totalDiscountAmount?: number;
        betterDiscountType?: 'manual' | 'automatic';
        errorMessage?: string;
    }> {
        try {
            // Find the discount by code
            const foundDiscount = await this.discountRepository.findOne({
                where: { discountCode: code },
            });

            if (!foundDiscount) {
                return { valid: false, errorMessage: 'Invalid discount code' };
            }

            const today = new Date();

            // Check if discount is active and valid date range
            if (
                foundDiscount.status !== 'active' ||
                foundDiscount.startDate > today ||
                foundDiscount.endDate < today
            ) {
                return {
                    valid: false,
                    errorMessage:
                        'This discount code is not active or has expired',
                };
            }

            // If it's a product-specific discount, at least one product in cart must match
            if (
                foundDiscount.targetType === 'products' &&
                foundDiscount.productIds &&
                foundDiscount.productIds.length > 0 &&
                productIds &&
                productIds.length > 0
            ) {
                // Check if at least one product in cart is in the target list
                const hasMatchingProduct = productIds.some((id) =>
                    foundDiscount.productIds.includes(id),
                );

                if (!hasMatchingProduct) {
                    return {
                        valid: false,
                        errorMessage:
                            'This discount code is not applicable to any products in your cart',
                    };
                }
            }

            // Check minimum order amount if applicable - for overall discounts only
            if (
                foundDiscount.targetType === 'all' &&
                foundDiscount.minOrderAmount &&
                orderAmount < foundDiscount.minOrderAmount
            ) {
                return {
                    valid: false,
                    errorMessage: `This discount requires a minimum order amount of ${foundDiscount.minOrderAmount}₫`,
                };
            }

            // Calculate manual discount amount based on targeting
            let manualDiscountAmount = 0;

            // Calculate discount amount differently based on targeting
            if (
                foundDiscount.targetType === 'products' &&
                productIds &&
                productIds.length > 0
            ) {
                // For product-specific discounts, only apply to matching products
                if (
                    foundDiscount.productIds &&
                    foundDiscount.productIds.length > 0
                ) {
                    // Use product prices for more accurate calculation
                    if (
                        productPrices &&
                        Object.keys(productPrices).length > 0
                    ) {
                        manualDiscountAmount =
                            this.calculateDiscountWithProductPrices(
                                foundDiscount,
                                productIds,
                                productPrices,
                            );
                    } else {
                        // Fall back to proportion-based calculation
                        const applicableAmount =
                            this.calculateApplicableAmountForProducts(
                                productIds,
                                foundDiscount.productIds,
                                orderAmount,
                            );

                        if (foundDiscount.type === 'percentage') {
                            manualDiscountAmount =
                                (applicableAmount *
                                    Number(foundDiscount.discountAmount)) /
                                100;
                        } else {
                            manualDiscountAmount = Math.min(
                                Number(foundDiscount.discountAmount),
                                applicableAmount,
                            );
                        }
                    }
                }
            } else {
                // For 'all' target type or other types, apply to entire order
                if (foundDiscount.type === 'percentage') {
                    manualDiscountAmount =
                        (orderAmount * Number(foundDiscount.discountAmount)) /
                        100;
                } else {
                    manualDiscountAmount = Math.min(
                        Number(foundDiscount.discountAmount),
                        orderAmount,
                    );
                }
            }

            let automaticDiscounts: DiscountResponseDto[] = [];
            let automaticDiscountAmount = 0;

            // If there are productIds, check for automatic discounts too
            if (productIds && productIds.length > 0) {
                automaticDiscounts = await this.getAutomaticDiscounts({
                    productIds,
                    orderAmount,
                });

                // Calculate total automatic discount amount with targeting consideration
                if (automaticDiscounts.length > 0) {
                    // Pass productPrices to the calculation method
                    automaticDiscountAmount =
                        await this.calculateTotalTargetedDiscounts(
                            automaticDiscounts,
                            productIds,
                            orderAmount,
                            productPrices,
                        );
                }
            }

            // Return both manual and automatic discounts and determine which is better
            const betterDiscountType =
                manualDiscountAmount >= automaticDiscountAmount
                    ? 'manual'
                    : 'automatic';

            return {
                valid: true,
                discount: this.mapToDto(foundDiscount),
                discountAmount: manualDiscountAmount,
                automaticDiscounts: automaticDiscounts,
                automaticDiscountAmount: automaticDiscountAmount,
                betterDiscountType,
                totalDiscountAmount: Math.max(
                    manualDiscountAmount,
                    automaticDiscountAmount,
                ),
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                return { valid: false, errorMessage: 'Invalid discount code' };
            }
            throw error;
        }
    }

    // Add helper method to calculate applicable amount for product-specific discounts
    private calculateApplicableAmountForProducts(
        cartProductIds: string[],
        discountProductIds: string[],
        totalAmount: number,
    ): number {
        // In a real implementation, you would:
        // 1. Calculate what percentage of the cart consists of the targeted products
        // 2. Apply that percentage to the total amount

        // For now, we'll estimate it based on how many products match
        const matchingProducts = cartProductIds.filter((id) =>
            discountProductIds.includes(id),
        );

        if (matchingProducts.length === 0) return 0;

        // Simple proportional calculation (this should be more precise in real implementation)
        const ratio = matchingProducts.length / cartProductIds.length;
        return totalAmount * ratio;
    }

    // Add helper method to calculate total discounts respecting targeting
    private async calculateTotalTargetedDiscounts(
        discounts: DiscountResponseDto[],
        productIds: string[],
        orderAmount: number,
        productPrices?: Record<string, number>, // Add optional productPrices parameter
    ): Promise<number> {
        let total = 0;

        for (const discount of discounts) {
            // For product-specific discounts, only apply to matching products
            if (
                discount.targetType === 'products' &&
                discount.productIds &&
                discount.productIds.length > 0
            ) {
                const matchingProductIds = productIds.filter((id) =>
                    discount.productIds?.includes(id),
                );

                if (matchingProductIds.length === 0) continue;

                // If we have product prices, use them for more accurate calculation
                if (productPrices && Object.keys(productPrices).length > 0) {
                    let productSubtotal = 0;
                    for (const id of matchingProductIds) {
                        productSubtotal += productPrices[id] || 0;
                    }

                    if (discount.type === 'percentage') {
                        total +=
                            (productSubtotal * discount.discountAmount) / 100;
                    } else {
                        total += Math.min(
                            discount.discountAmount,
                            productSubtotal,
                        );
                    }
                } else {
                    // Fall back to proportion-based calculation
                    const applicableAmount =
                        this.calculateApplicableAmountForProducts(
                            productIds,
                            discount.productIds,
                            orderAmount,
                        );

                    if (discount.type === 'percentage') {
                        total +=
                            (applicableAmount * discount.discountAmount) / 100;
                    } else {
                        total += Math.min(
                            discount.discountAmount,
                            applicableAmount,
                        );
                    }
                }
            } else {
                // For non-targeted discounts, apply to entire order
                if (discount.type === 'percentage') {
                    total += (orderAmount * discount.discountAmount) / 100;
                } else {
                    total += Math.min(discount.discountAmount, orderAmount);
                }
            }
        }

        return total;
    }

    // Add a new helper method to calculate discounts with product prices
    private calculateDiscountWithProductPrices(
        discount: Discount,
        cartProductIds: string[],
        productPrices: Record<string, number>,
    ): number {
        let totalDiscount = 0;

        // Only apply discount to products that match the target products
        if (discount.targetType === 'products' && discount.productIds) {
            // Find products that are in both the cart and the discount target list
            const applicableProductIds = cartProductIds.filter((id) =>
                discount.productIds?.includes(id),
            );

            // If no applicable products, return 0 discount
            if (applicableProductIds.length === 0) return 0;

            // Calculate discount for each applicable product
            for (const productId of applicableProductIds) {
                const productPrice = productPrices[productId] || 0;

                if (productPrice > 0) {
                    if (discount.type === 'percentage') {
                        totalDiscount +=
                            (productPrice * Number(discount.discountAmount)) /
                            100;
                    } else {
                        // For fixed discount, apply to each eligible product (up to product price)
                        totalDiscount += Math.min(
                            Number(discount.discountAmount),
                            productPrice,
                        );
                    }
                }
            }
        } else {
            // For non-product specific discounts, apply to the sum of all prices
            const totalPrice = Object.values(productPrices).reduce(
                (sum, price) => sum + price,
                0,
            );

            if (discount.type === 'percentage') {
                totalDiscount =
                    (totalPrice * Number(discount.discountAmount)) / 100;
            } else {
                totalDiscount = Math.min(
                    Number(discount.discountAmount),
                    totalPrice,
                );
            }
        }

        return totalDiscount;
    }

    /**
     * Increment usage count for a discount
     * @param discountId ID of the discount
     * @param savingsAmount Amount saved by using this discount
     * @returns Promise with updated discount
     */
    async incrementUsageCount(
        discountId: number,
        savingsAmount: number,
    ): Promise<Discount> {
        try {
            this.logger.log(
                `Incrementing usage count for discount #${discountId} with savings amount ${savingsAmount}`,
            );

            const discount = await this.discountRepository.findOne({
                where: { id: discountId },
            });

            if (!discount) {
                throw new NotFoundException(
                    `Discount with ID ${discountId} not found`,
                );
            }

            // Increment usage count
            discount.usageCount += 1;

            // Add to total savings amount
            if (!discount.totalSavingsAmount) {
                discount.totalSavingsAmount = 0;
            }
            discount.totalSavingsAmount =
                Number(discount.totalSavingsAmount) + savingsAmount;

            // Save updated discount
            return await this.discountRepository.save(discount);
        } catch (error) {
            this.logger.error(
                `Error incrementing discount usage: ${error.message}`,
            );
            throw error;
        }
    }
}
