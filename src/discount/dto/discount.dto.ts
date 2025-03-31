import {
    IsString,
    IsNumber,
    IsNotEmpty,
    IsEnum,
    IsOptional,
    IsDateString,
    Min,
    Max,
    IsArray,
    IsBoolean,
} from 'class-validator';
import { DiscountTargetType } from '../discount.entity';

export class CreateDiscountDto {
    @IsString()
    @IsNotEmpty()
    discountCode: string;

    @IsString()
    @IsNotEmpty()
    discountName: string;

    @IsString()
    @IsOptional()
    discountDescription?: string;

    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @IsDateString()
    @IsNotEmpty()
    endDate: string;

    @IsNumber()
    @Min(0)
    discountAmount: number;

    @IsEnum(['percentage', 'fixed'], {
        message: 'Type must be either "percentage" or "fixed"',
    })
    type: 'percentage' | 'fixed';

    @IsEnum(['active', 'inactive'], {
        message: 'Status must be either "active" or "inactive"',
    })
    @IsOptional()
    status?: 'active' | 'inactive';

    // New fields for targeting
    @IsEnum(['all', 'products', 'categories', 'customers'], {
        message: 'Invalid target type',
    })
    @IsOptional()
    targetType?: DiscountTargetType;

    @IsArray()
    @IsOptional()
    productIds?: string[];

    @IsArray()
    @IsOptional()
    categoryNames?: string[];

    @IsArray()
    @IsOptional()
    customerIds?: string[];

    @IsNumber()
    @IsOptional()
    @Min(0)
    minOrderAmount?: number;

    @IsBoolean()
    @IsOptional()
    isFirstPurchaseOnly?: boolean;

    @IsBoolean()
    @IsOptional()
    isAutomatic?: boolean;
}

// Fix: Create a new class instead of extending
export class UpdateDiscountDto {
    @IsString()
    @IsOptional()
    discountCode?: string;

    @IsString()
    @IsOptional()
    discountName?: string;

    @IsString()
    @IsOptional()
    discountDescription?: string;

    @IsDateString()
    @IsOptional()
    startDate?: string;

    @IsDateString()
    @IsOptional()
    endDate?: string;

    @IsNumber()
    @IsOptional()
    @Min(0)
    discountAmount?: number;

    @IsEnum(['percentage', 'fixed'], {
        message: 'Type must be either "percentage" or "fixed"',
    })
    @IsOptional()
    type?: 'percentage' | 'fixed';

    @IsEnum(['active', 'inactive'], {
        message: 'Status must be either "active" or "inactive"',
    })
    @IsOptional()
    status?: 'active' | 'inactive';

    // New fields for targeting
    @IsEnum(['all', 'products', 'categories', 'customers'], {
        message: 'Invalid target type',
    })
    @IsOptional()
    targetType?: DiscountTargetType;

    @IsArray()
    @IsOptional()
    productIds?: string[];

    @IsArray()
    @IsOptional()
    categoryNames?: string[];

    @IsArray()
    @IsOptional()
    customerIds?: string[];

    @IsNumber()
    @IsOptional()
    @Min(0)
    minOrderAmount?: number;

    @IsBoolean()
    @IsOptional()
    isFirstPurchaseOnly?: boolean;

    @IsBoolean()
    @IsOptional()
    isAutomatic?: boolean;
}

export class DiscountResponseDto {
    id: number;
    discountCode: string;
    discountName: string;
    discountDescription?: string;
    startDate: string;
    endDate: string;
    discountAmount: number;
    type: 'percentage' | 'fixed';
    status: 'active' | 'inactive' | 'expired';
    // Include new targeting fields
    targetType: DiscountTargetType;
    productIds?: string[];
    categoryNames?: string[];
    customerIds?: string[];
    minOrderAmount?: number;
    isFirstPurchaseOnly: boolean;
    isAutomatic: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export class DiscountStatisticsDto {
    totalUsage: number;
    totalSavings: number;
    mostUsedDiscounts: { discountCode: string; usageCount: number }[];
}
