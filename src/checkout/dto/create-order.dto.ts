import {
    IsArray,
    IsNotEmpty,
    IsNumber,
    IsString,
    ValidateNested,
    IsOptional,
    Min,
    IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
    @IsString()
    productId: string;

    @IsNumber()
    quantity: number;

    @IsNumber()
    price: number;
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
    discountAmount?: number;

    @IsNumber()
    @IsOptional()
    manualDiscountId?: number;

    @IsArray()
    @IsOptional()
    appliedDiscountIds?: string[];
}
