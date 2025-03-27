import { IsNotEmpty, IsOptional, IsString, IsObject, IsUUID, IsNumber, IsNumberString } from 'class-validator';

export class CreateEventDto {
    @IsNotEmpty()
    @IsString()
    eventType: string;

    @IsOptional()
    @IsNumberString()
    customerId?: string;

    @IsOptional()
    @IsString()
    sessionId?: string;

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
