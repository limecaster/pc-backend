export class ProductSpecDto {
    name: string;
    value: string;
}

export class ReviewDto {
    id: string;
    username: string;
    rating: number;
    date: string;
    content: string;
    avatar: string;
}

export class ProductDetailsDto {
    id: string;
    name: string;
    price: number;
    originalPrice?: number; // Original price before any discounts
    discountPercentage?: number; // Percentage discount if applied
    isDiscounted?: boolean; // Flag to indicate if product has a discount
    discountSource?: 'automatic' | 'manual'; // Source of the discount
    discountType?: 'percentage' | 'fixed'; // Type of discount (percentage or fixed amount)
    discount?: number;
    rating: number;
    reviewCount: number;
    description: string;
    additionalInfo?: string;
    imageUrl: string;
    additionalImages?: string[];
    specifications: ProductSpecDto;
    reviews?: ReviewDto[];
    sku: string;
    stock: string;
    brand: string;
    category: string;
    color?: string;
    size?: string;
    status?: string;
    stockQuantity?: number;
}
