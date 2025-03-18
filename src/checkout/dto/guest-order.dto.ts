import {
    IsArray,
    IsEmail,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemDto } from './create-order.dto';

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
}
