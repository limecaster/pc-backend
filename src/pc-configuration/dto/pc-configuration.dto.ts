import {
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsNumber,
} from 'class-validator';

export class CreatePCConfigurationDto {
    @IsNotEmpty()
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    purpose?: string;

    @IsNotEmpty()
    @IsObject()
    products: Record<string, any>;

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
    @IsObject()
    products?: Record<string, any>;

    @IsOptional()
    @IsNumber()
    totalPrice?: number;

    @IsOptional()
    @IsNumber()
    wattage?: number;
}
