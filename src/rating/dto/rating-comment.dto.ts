import { IsNotEmpty, IsNumber, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateRatingCommentDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsNotEmpty()
  stars: number;

  @IsString()
  @IsNotEmpty()
  comment: string;
}

export class RatingCommentResponseDto {
  id: number;
  username: string;
  rating: number;
  date: string;
  content: string;
  avatar?: string;
  customerId: number;
}
