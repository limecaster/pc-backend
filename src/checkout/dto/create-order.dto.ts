import {
    IsArray,
    IsNotEmpty,
    IsNumber,
    IsString,
    ValidateNested,
    IsOptional,
    Min,
    IsBoolean,
    IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
    @IsString()
    productId: string;

    @IsNumber()
    quantity: number;

    @IsNumber()
    price: number;

    @IsNumber()
    @IsOptional()
    originalPrice?: number;

    @IsNumber()
    @IsOptional()
    finalPrice?: number;

    @IsString()
    @IsOptional()
    discountType?: string;

    @IsNumber()
    @IsOptional()
    discountAmount?: number;
}

export class ProductDiscountInfo {
    @IsString()
    discountId: string;

    @IsString()
    discountType: string;

    @IsNumber()
    amount: number;
}

export class CreateOrderDto {
    @IsNumber()
    @IsNotEmpty()
    total: number;

    @IsString()
    @IsNotEmpty()
    paymentMethod: string;

    @IsString()
    @IsNotEmpty()
    deliveryAddress: string;

    @IsString()
    @IsOptional()
    customerName?: string;

    @IsString()
    @IsOptional()
    customerPhone?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OrderItemDto)
    items: OrderItemDto[];

    @IsString()
    @IsOptional()
    notes?: string;

    @IsNumber()
    @IsOptional()
    @Min(0)
    subtotal?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    shippingFee?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    discountAmount?: number;

    @IsNumber()
    @IsOptional()
    manualDiscountId?: number;

    @IsArray()
    @IsOptional()
    appliedDiscountIds?: string[];

    @IsObject()
    @IsOptional()
    appliedProductDiscounts?: Record<string, ProductDiscountInfo>;
}
