import { Controller, Post, Body, Get, Param, Delete, UseGuards, Request, HttpStatus, HttpCode, ParseIntPipe, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RatingService } from './rating.service';
import { CreateRatingCommentDto, RatingCommentResponseDto } from './dto/rating-comment.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('ratings')
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles(Role.CUSTOMER)
  async create(@Body() createRatingCommentDto: CreateRatingCommentDto, @Request() req) {
    try {
      return await this.ratingService.create(createRatingCommentDto, req.user.id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create rating: ${error.message}`);
    }
  }

  @Get('product/:productId')
  async findAllByProductId(@Param('productId') productId: string): Promise<RatingCommentResponseDto[]> {
    try {
      return await this.ratingService.findAllByProductId(productId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to get ratings: ${error.message}`);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @Roles(Role.CUSTOMER)
  async delete(@Param('id', ParseIntPipe) id: number, @Request() req) {
    try {
      await this.ratingService.delete(id, req.user.id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete rating: ${error.message}`);
    }
  }

  @Get('check/:productId')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.CUSTOMER)
  async checkUserRating(@Param('productId') productId: string, @Request() req) {
    try {
      const hasRated = await this.ratingService.hasUserRated(productId, req.user.id);
      return { hasRated };
    } catch (error) {
      throw new BadRequestException(`Failed to check rating status: ${error.message}`);
    }
  }
}
