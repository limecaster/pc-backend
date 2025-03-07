export class Product {
  id: number;
  name: string;
  description: string;
  price: number;
  stock_quantity: number;
  category: string;
  created_at: Date;
  updated_at: Date;

  // Additional fields that might need to be added to the database schema
  original_price?: number;
  discount?: number;
  sku?: string;
  brand?: string;
  image_url?: string;
  additional_images?: string;
  additional_info?: string;
  size?: string;
  color?: string;
}
