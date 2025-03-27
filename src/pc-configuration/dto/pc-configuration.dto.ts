import {
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsNumber,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class PCConfigurationProductDto {
    @IsNotEmpty()
    @IsString()
    componentType: string;

    @IsNotEmpty()
    @IsString()
    productId: string;

    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsNumber()
    @Transform(({ value }) => {   
        if (value === null || value === undefined) {
            return 0;
        }
        
        const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : Number(value);        
        return isNaN(num) ? 0 : num;
    })
    price?: number;

    @IsOptional()
    @IsObject()
    details?: any;
}

export class CreatePCConfigurationDto {
    @IsNotEmpty()
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    purpose?: string;

    @IsNotEmpty()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PCConfigurationProductDto)
    products: PCConfigurationProductDto[];

    @IsOptional()
    @IsNumber()
    totalPrice?: number;

    @IsOptional()
    @IsNumber()
    wattage?: number;
}

export class UpdatePCConfigurationDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    purpose?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PCConfigurationProductDto)
    products?: PCConfigurationProductDto[];

    @IsOptional()
    @IsNumber()
    totalPrice?: number;

    @IsOptional()
    @IsNumber()
    wattage?: number;
}
