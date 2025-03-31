import {
    IsNotEmpty,
    IsOptional,
    IsString,
    IsObject,
    IsUUID,
    IsNumber,
    IsNumberString,
    IsIn,
} from 'class-validator';

export class CreateEventDto {
    @IsNotEmpty()
    @IsString()
    eventType: string;

    @IsOptional()
    @IsNumberString()
    customerId?: string;

    @IsNotEmpty()
    @IsString()
    sessionId: string;

    @IsOptional()
    @IsString()
    entityId?: string;

    @IsOptional()
    @IsString()
    entityType?: string;

    @IsOptional()
    @IsString()
    pageUrl?: string;

    @IsOptional()
    @IsString()
    referrerUrl?: string;

    @IsOptional()
    @IsObject()
    deviceInfo?: Record<string, any>;

    @IsOptional()
    @IsString()
    ipAddress?: string;

    @IsOptional()
    @IsObject()
    eventData?: Record<string, any>;
}

export class ProductClickEventDto extends CreateEventDto {
    @IsNotEmpty()
    @IsString()
    productId: string;

    @IsOptional()
    @IsString()
    productName?: string;

    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    @IsNumber()
    price?: number;
}

export class DiscountUsageEventDto {
    @IsNotEmpty()
    @IsString()
    orderId: string;

    @IsOptional()
    @IsString()
    customerId?: string;

    @IsIn(['manual', 'automatic'])
    @IsString()
    discountType: 'manual' | 'automatic';

    @IsNotEmpty()
    @IsObject()
    discountData: {
        discountAmount: number;
        manualDiscountId?: number;
        appliedDiscountIds?: string[];
        orderTotal: number;
        orderSubtotal: number;
        savingsPercent: number;
    };
}
