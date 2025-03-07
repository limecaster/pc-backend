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
  originalPrice?: number;
  discount?: number;
  rating: number;
  reviewCount: number;
  description: string;
  additionalInfo?: string;
  imageUrl: string;
  additionalImages?: string[];
  specifications: ProductSpecDto[];
  reviews?: ReviewDto[];
  sku: string;
  stock: string;
  brand: string;
  category: string;
  color?: string;
  size?: string;
}
