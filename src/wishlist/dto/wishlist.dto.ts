import { IsNotEmpty, IsString } from 'class-validator';

export class AddToWishlistDto {
    @IsNotEmpty()
    @IsString()
    productId: string;
}

export class WishlistItemDto {
    product_id: string;
    name: string;
    price: number;
    imageUrl: string;
}
