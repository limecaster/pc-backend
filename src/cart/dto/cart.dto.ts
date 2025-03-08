import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AddToCartDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity: number = 1;
}

export class AddMultipleToCartDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty({ each: true })
  productIds: string[];
}

export class CartItemDto {
  @IsString()
  productId: string;
  
  @IsNumber()
  quantity: number;
  
  @IsNumber()
  price: number;
}

export class CartDto {
  @IsString()
  userId: string;
  
  @IsArray()
  items: CartItemDto[];
  
  @IsNumber()
  totalPrice: number;
}

export class CartResponseDto {
  id: number;
  status: string;
  items: {
    id: number;
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    subPrice: number;
  }[];
  totalPrice: number;
}

export class UpdateCartItemDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}
