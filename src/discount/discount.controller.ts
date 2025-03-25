import { 
    Controller, 
    Get, 
    Post, 
    Body, 
    Param, 
    Put, 
    Delete, 
    UseGuards, 
    Logger,
    Query,
    BadRequestException
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { DiscountService } from './discount.service';
import { CreateDiscountDto, UpdateDiscountDto } from './dto/discount.dto';

@Controller('discounts')
export class DiscountController {
    private readonly logger = new Logger(DiscountController.name);

    constructor(private readonly discountService: DiscountService) {}

    @Get('admin')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async findAll() {
        this.logger.log('Getting all discounts for admin');
        const discounts = await this.discountService.findAll();
        return { success: true, discounts };
    }

    @Get('statistics')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async getStatistics() {
        this.logger.log('Getting discount statistics');
        return await this.discountService.getStatistics();
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async create(@Body() createDiscountDto: CreateDiscountDto) {
        this.logger.log(`Creating new discount: ${createDiscountDto.discountCode}`);
        return await this.discountService.create(createDiscountDto);
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async findOne(@Param('id') id: string) {
        this.logger.log(`Getting discount with id: ${id}`);
        return await this.discountService.findOne(+id);
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async update(@Param('id') id: string, @Body() updateDiscountDto: UpdateDiscountDto) {
        this.logger.log(`Updating discount with id: ${id}`);
        return await this.discountService.update(+id, updateDiscountDto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async remove(@Param('id') id: string) {
        this.logger.log(`Deleting discount with id: ${id}`);
        return await this.discountService.remove(+id);
    }

    @Get('code/:code')
    async findByCode(@Param('code') code: string) {
        this.logger.log(`Getting discount by code: ${code}`);
        return await this.discountService.findByCode(code);
    }

    @Post('validate')
    async validateDiscount(@Body() data: { 
        code: string; 
        orderAmount: number;
        productIds?: string[];
        productPrices?: Record<string, number>; 
    }) {
        this.logger.log(`Validating discount code: ${data.code} for order amount: ${data.orderAmount}`);
        
        if (!data.code) {
            throw new BadRequestException('Discount code is required');
        }
        
        if (data.orderAmount === undefined || data.orderAmount < 0) {
            throw new BadRequestException('Valid order amount is required');
        }
        
        const validatedDiscount = await this.discountService.validateDiscount(
            data.code, 
            data.orderAmount, 
            data.productIds,
            data.productPrices
        );

        if (!validatedDiscount.valid) {
            throw new BadRequestException(validatedDiscount.errorMessage || 'Invalid discount code');
        }

        const actualDiscount = validatedDiscount.discount;
        if (!actualDiscount) {
            throw new BadRequestException('No discount found');
        }

        if (new Date(actualDiscount.endDate) < new Date()) {
            throw new BadRequestException('Discount code is expired');
        }
        if (
            actualDiscount.minOrderAmount &&
            data.orderAmount < actualDiscount.minOrderAmount
        ) {
            throw new BadRequestException(
                `Order must be at least ${actualDiscount.minOrderAmount}`
            );
        }
        return validatedDiscount;
    }

    @Post('automatic')
    async getAutomaticDiscounts(@Body() options: {
        productIds?: string[];
        categoryNames?: string[];
        customerId?: string;
        isFirstPurchase?: boolean;
        orderAmount?: number;
        productPrices?: Record<string, number>; 
    }) {
        this.logger.log(`Fetching automatic discounts for cart with ${options.productIds?.length || 0} products`);
        
 
        const discounts = await this.discountService.getAutomaticDiscounts({
            ...options
        });
        
        return { success: true, discounts };
    }
}
