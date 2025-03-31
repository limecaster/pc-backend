import {
    Body,
    Controller,
    Get,
    Post,
    Put,
    Delete,
    UseGuards,
    Request,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { CartService } from './cart.service';
import {
    AddToCartDto,
    AddMultipleToCartDto,
    UpdateCartItemDto,
} from './dto/cart.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
    private readonly logger = new Logger(CartController.name);

    constructor(private readonly cartService: CartService) {}

    @Post('add')
    async addToCart(@Request() req, @Body() addToCartDto: AddToCartDto) {
        const userId = req.user?.id;

        if (!userId) {
            this.logger.error(
                'User not authenticated or missing ID in addToCart',
            );
            throw new BadRequestException(
                'User not authenticated or missing ID',
            );
        }

        const cart = await this.cartService.addToCart(
            userId,
            addToCartDto.productId,
            addToCartDto.quantity,
        );

        return {
            success: true,
            message: 'Product added to cart',
            cart,
        };
    }

    @Post('add-multiple')
    async addMultipleToCart(
        @Request() req,
        @Body() addMultipleDto: AddMultipleToCartDto,
    ) {
        const userId = req.user?.id;

        if (!userId) {
            this.logger.error(
                'User not authenticated or missing ID in addMultipleToCart',
            );
            throw new BadRequestException(
                'User not authenticated or missing ID',
            );
        }

        const cart = await this.cartService.addMultipleToCart(
            userId,
            addMultipleDto.productIds,
        );

        return {
            success: true,
            message: 'Products added to cart',
            cart,
        };
    }

    @Put('update-item')
    async updateCartItem(
        @Request() req,
        @Body() updateCartItemDto: UpdateCartItemDto,
    ) {
        const userId = req.user?.id;

        if (!userId) {
            this.logger.error(
                'User not authenticated or missing ID in updateCartItem',
            );
            throw new BadRequestException(
                'User not authenticated or missing ID',
            );
        }

        const cart = await this.cartService.updateCartItem(
            userId,
            updateCartItemDto.productId,
            updateCartItemDto.quantity,
        );

        return {
            success: true,
            message: 'Cart item updated successfully',
            cart,
        };
    }

    @Delete('remove-item')
    async removeCartItem(
        @Request() req,
        @Body() removeItemDto: { productId: string },
    ) {
        const userId = req.user?.id;

        if (!userId) {
            this.logger.error(
                'User not authenticated or missing ID in removeCartItem',
            );
            throw new BadRequestException(
                'User not authenticated or missing ID',
            );
        }

        const cart = await this.cartService.removeCartItem(
            userId,
            removeItemDto.productId,
        );

        return {
            success: true,
            message: 'Item removed from cart successfully',
            cart,
        };
    }

    @Get()
    async getCart(@Request() req) {
        const userId = req.user?.id;

        if (!userId) {
            this.logger.error(
                'User not authenticated or missing ID in getCart',
            );
            throw new BadRequestException(
                'User not authenticated or missing ID',
            );
        }

        const cart = await this.cartService.getCart(userId);

        return {
            success: true,
            cart,
        };
    }
}
