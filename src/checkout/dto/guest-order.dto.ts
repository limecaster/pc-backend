import {
    IsArray,
    IsEmail,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemDto, ProductDiscountInfo } from './create-order.dto';

export class CustomerInfoDto {
    @IsString()
    @IsNotEmpty()
    fullName: string;

    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    phone: string;
}

export class GuestOrderDto {
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

    @IsString()
    @IsEmail()
    @IsOptional()
    email?: string;

    @IsNumber()
    @IsOptional()
    totalAmount?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    subtotal?: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    shippingFee?: number;

    @IsObject()
    @ValidateNested()
    @Type(() => CustomerInfoDto)
    customerInfo: CustomerInfoDto;

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
