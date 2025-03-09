export class AddToWishlistDto {
  productId: string;
}

export class WishlistItemDto {
  product_id: string;
  name: string;
  price: number;
  imageUrl: string;
}
