import {
    Controller,
    Get,
    Put,
    Post,
    Delete,
    Body,
    Param,
    UseGuards,
    Request,
} from '@nestjs/common';
import { AccountService } from './account.service';
import { ProfileDto, PasswordChangeDto } from './dto/profile.dto';
import { AddressDto } from './dto/address.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('dashboard/account')
@UseGuards(JwtAuthGuard)
export class AccountController {
    constructor(private readonly accountService: AccountService) {}

    @Get('profile')
    async getProfile(@Request() req) {
        return this.accountService.getProfile(req.user.id);
    }

    @Put('profile')
    async updateProfile(@Request() req, @Body() profileDto: ProfileDto) {
        return this.accountService.updateProfile(req.user.id, profileDto);
    }

    @Put('password')
    async changePassword(
        @Request() req,
        @Body() passwordDto: PasswordChangeDto,
    ) {
        return this.accountService.changePassword(req.user.id, passwordDto);
    }

    @Get('addresses')
    async getAddresses(@Request() req) {
        return this.accountService.getAddresses(req.user.id);
    }

    @Post('addresses')
    async addAddress(@Request() req, @Body() addressDto: AddressDto) {
        return this.accountService.addAddress(req.user.id, addressDto);
    }

    @Put('addresses/:id')
    async updateAddress(
        @Request() req,
        @Param('id') id: number,
        @Body() addressDto: AddressDto,
    ) {
        return this.accountService.updateAddress(req.user.id, id, addressDto);
    }

    @Delete('addresses/:id')
    async deleteAddress(@Request() req, @Param('id') id: number) {
        return this.accountService.deleteAddress(req.user.id, id);
    }
}
