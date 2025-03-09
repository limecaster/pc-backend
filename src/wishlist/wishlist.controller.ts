import { Controller, Get, Post, Delete, Param, Body, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { AddToWishlistDto, WishlistItemDto } from './dto/wishlist.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  async getWishlist(@Request() req): Promise<WishlistItemDto[]> {
    try {
      const customerId = req.user.id;
      return await this.wishlistService.getWishlist(customerId);
    } catch (error) {
      console.error('Error retrieving wishlist:', error);
      throw new Error('Failed to retrieve wishlist');
    }
  }

  @Post('add')
  async addToWishlist(
    @Request() req,
    @Body() addToWishlistDto: AddToWishlistDto,
  ) {
    try {
      const customerId = req.user.id;
      return await this.wishlistService.addToWishlist(
        customerId,
        addToWishlistDto.productId,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error adding to wishlist:', error);
      throw new Error('Failed to add product to wishlist');
    }
  }

  @Delete('remove/:productId')
  async removeFromWishlist(
    @Request() req,
    @Param('productId') productId: string,
  ) {
    try {
      const customerId = req.user.id;
      return await this.wishlistService.removeFromWishlist(customerId, productId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error removing from wishlist:', error);
      throw new Error('Failed to remove product from wishlist');
    }
  }
  
  @Get('check/:productId')
  async isInWishlist(
    @Request() req,
    @Param('productId') productId: string,
  ): Promise<{ inWishlist: boolean }> {
    try {
      const customerId = req.user.id;
      const result = await this.wishlistService.isInWishlist(customerId, productId);
      return { inWishlist: result };
    } catch (error) {
      console.error('Error checking wishlist:', error);
      throw new Error('Failed to check if product is in wishlist');
    }
  }
}
