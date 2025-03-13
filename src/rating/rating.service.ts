import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PostgresConfigService } from '../../config/postgres.config';
import { CreateRatingCommentDto, RatingCommentResponseDto } from './dto/rating-comment.dto';

@Injectable()
export class RatingService {
  constructor(private readonly postgresConfigService: PostgresConfigService) {}

  async create(createRatingCommentDto: CreateRatingCommentDto, customerId: number): Promise<RatingCommentResponseDto> {
    const pool = this.postgresConfigService.getPool();
    
    try {
      // Check if product exists
      const productCheckResult = await pool.query(
        'SELECT id FROM "Products" WHERE id = $1 AND status = $2',
        [createRatingCommentDto.productId, 'active']
      );
      
      if (productCheckResult.rows.length === 0) {
        throw new NotFoundException('Product not found');
      }
      
      // Check if user already rated this product
      const existingRatingResult = await pool.query(
        'SELECT id FROM "Rating_Comment" WHERE customer_id = $1 AND product_id = $2',
        [customerId, createRatingCommentDto.productId]
      );
      
      let ratingId;
      
      if (existingRatingResult.rows.length > 0) {
        // Update existing rating
        ratingId = existingRatingResult.rows[0].id;
        await pool.query(
          'UPDATE "Rating_Comment" SET stars = $1, comment = $2, updated_at = NOW() WHERE id = $3',
          [createRatingCommentDto.stars, createRatingCommentDto.comment, ratingId]
        );
      } else {
        // Create new rating
        const result = await pool.query(
          'INSERT INTO "Rating_Comment" (customer_id, product_id, stars, comment, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id',
          [customerId, createRatingCommentDto.productId, createRatingCommentDto.stars, createRatingCommentDto.comment]
        );
        ratingId = result.rows[0].id;
      }
      
      // Return the created/updated rating
      const ratingResult = await pool.query(
        `SELECT 
          rc.id, 
          CONCAT(c.firstname, ' ', c.lastname) as username,
          rc.stars as rating,
          TO_CHAR(rc.created_at, 'DD/MM/YYYY') as date,
          rc.comment as content,
          c.avatar,
          rc.customer_id as "customerId"
        FROM 
          "Rating_Comment" rc
        JOIN 
          "Customer" c ON rc.customer_id = c.id
        WHERE 
          rc.id = $1`,
        [ratingId]
      );
      
      return ratingResult.rows[0];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create rating: ${error.message}`);
    }
  }

  async findAllByProductId(productId: string): Promise<RatingCommentResponseDto[]> {
    const pool = this.postgresConfigService.getPool();
    
    try {
      // Check if product exists
      const productCheckResult = await pool.query(
        'SELECT id FROM "Products" WHERE id = $1',
        [productId]
      );
      
      if (productCheckResult.rows.length === 0) {
        throw new NotFoundException('Product not found');
      }
      
      // Get all ratings for the product
      const ratingsResult = await pool.query(
        `SELECT 
          rc.id, 
          CONCAT(c.firstname, ' ', c.lastname) as username,
          rc.stars as rating,
          TO_CHAR(rc.created_at, 'DD/MM/YYYY') as date,
          rc.comment as content,
          c.avatar,
          rc.customer_id as "customerId"
        FROM 
          "Rating_Comment" rc
        JOIN 
          "Customer" c ON rc.customer_id = c.id
        WHERE 
          rc.product_id = $1
        ORDER BY 
          rc.created_at DESC`,
        [productId]
      );
      
      return ratingsResult.rows;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to get ratings: ${error.message}`);
    }
  }

  async delete(id: number, customerId: number): Promise<void> {
    const pool = this.postgresConfigService.getPool();
    
    try {
      // Check if rating exists and belongs to the customer
      const ratingResult = await pool.query(
        'SELECT id FROM "Rating_Comment" WHERE id = $1 AND customer_id = $2',
        [id, customerId]
      );
      
      if (ratingResult.rows.length === 0) {
        throw new NotFoundException('Rating not found or you do not have permission to delete it');
      }
      
      // Delete the rating
      await pool.query(
        'DELETE FROM "Rating_Comment" WHERE id = $1',
        [id]
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete rating: ${error.message}`);
    }
  }

  async hasUserRated(productId: string, customerId: number): Promise<boolean> {
    const pool = this.postgresConfigService.getPool();
    
    try {
      const result = await pool.query(
        'SELECT id FROM "Rating_Comment" WHERE product_id = $1 AND customer_id = $2',
        [productId, customerId]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      throw new BadRequestException(`Failed to check rating status: ${error.message}`);
    }
  }
}
