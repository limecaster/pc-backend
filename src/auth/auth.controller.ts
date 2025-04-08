import {
    Controller,
    Post,
    Body,
    Get,
    UseGuards,
    Request,
    Put,
    ConflictException,
    Logger,
    HttpCode,
    HttpStatus,
    UnauthorizedException,
    BadRequestException,
    NotFoundException,
    Query,
    Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CustomerService } from '../customer/customer.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { StaffService } from '../staff/staff.service';
import { AdminService } from '../admin/admin.service';
import { Role } from './enums/role.enum';
import { AuthGuard } from '@nestjs/passport';
import { EmailService } from '../email/email.service';

@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    constructor(
        private authService: AuthService,
        private customerService: CustomerService,
        private staffService: StaffService,
        private adminService: AdminService,
        private emailService: EmailService,
    ) {}

    @UseGuards(LocalAuthGuard)
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Request() req) {
        return this.authService.login(req.user);
    }

    @Post('staff/login')
    @HttpCode(HttpStatus.OK)
    async staffLogin(
        @Body() loginData: { username: string; password: string },
    ) {
        try {
            const staff = await this.staffService.validateStaff(
                loginData.username,
                loginData.password,
            );

            return this.authService.login({
                ...staff,
                role: Role.STAFF,
            });
        } catch (error) {
            this.logger.error(
                `Staff login error for ${loginData.username}: ${error.message}`,
            );

            if (error instanceof UnauthorizedException) {
                throw new UnauthorizedException('Invalid staff credentials');
            }

            throw new UnauthorizedException('Failed to authenticate staff');
        }
    }

    @Post('admin/login')
    @HttpCode(HttpStatus.OK)
    async adminLogin(
        @Body() loginData: { username: string; password: string },
    ) {
        try {
            const admin = await this.adminService.validateAdmin(
                loginData.username,
                loginData.password,
            );

            return this.authService.login({
                ...admin,
                role: Role.ADMIN,
            });
        } catch (error) {
            this.logger.error(
                `Admin login error for ${loginData.username}: ${error.message}`,
            );

            throw new UnauthorizedException('Invalid admin credentials');
        }
    }

    @Post('unified-login')
    @HttpCode(HttpStatus.OK)
    async unifiedLogin(
        @Body() loginData: { username: string; password: string },
    ) {
        try {
            try {
                const admin = await this.adminService.validateAdmin(
                    loginData.username,
                    loginData.password,
                );
                if (admin) {
                    return this.authService.login({
                        ...admin,
                        role: Role.ADMIN,
                    });
                }
            } catch {}

            try {
                const staff = await this.staffService.validateStaff(
                    loginData.username,
                    loginData.password,
                );
                if (staff) {
                    return this.authService.login({
                        ...staff,
                        role: Role.STAFF,
                    });
                }
            } catch {}

            try {
                const customer = await this.customerService.validateCustomer(
                    loginData.username,
                    loginData.password,
                );
                if (customer) {
                    return this.authService.login({
                        ...customer,
                        role: Role.CUSTOMER,
                    });
                }
            } catch {}

            throw new UnauthorizedException('Invalid credentials');
        } catch (error) {
            this.logger.error(
                `Login error for ${loginData.username}: ${error.message}`,
            );
            throw new UnauthorizedException('Invalid credentials');
        }
    }

    @Post('register')
    async register(
        @Body()
        userData: {
            email: string;
            password: string;
            username?: string;
            firstname?: string;
            lastname?: string;
        },
    ) {
        try {
            const result = await this.authService.register(userData);
            return {
                ...result,
                message:
                    'Registration successful! Please check your email for OTP verification code.',
            };
        } catch (error) {
            if (error instanceof ConflictException) {
                throw new ConflictException(
                    error.message || 'Email or username already exists',
                );
            }
            if (error instanceof BadRequestException) {
                throw new BadRequestException(error.message);
            }
            this.logger.error(
                `Error registering user ${userData.email}: ${error.message}`,
            );
            throw error;
        }
    }

    @Post('verify-email')
    async verifyEmail(@Body() verifyData: { email: string; otpCode: string }) {
        try {
            const verifiedUser = await this.customerService.verifyEmail(
                verifyData.email,
                verifyData.otpCode,
            );
            return {
                success: true,
                message: 'Email verified successfully',
                user: {
                    id: verifiedUser.id,
                    email: verifiedUser.email,
                    status: verifiedUser.status,
                    isEmailVerified: verifiedUser.isEmailVerified,
                },
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw new BadRequestException(error.message);
            }
            if (error instanceof ConflictException) {
                throw new ConflictException(error.message);
            }
            if (error instanceof BadRequestException) {
                throw new BadRequestException(error.message);
            }
            this.logger.error(
                `Error verifying email for ${verifyData.email}: ${error.message}`,
            );
            throw error;
        }
    }

    @Post('resend-otp')
    async resendOtp(
        @Body() body: { email: string; type: 'verification' | 'reset' },
    ) {
        try {
            if (body.type === 'verification') {
                await this.customerService.resendVerificationOTP(body.email);
            } else {
                await this.customerService.createPasswordResetToken(body.email);
            }

            return {
                message: 'A new verification code has been sent to your email',
            };
        } catch (error) {
            this.logger.error(
                `Error resending OTP for ${body.email}: ${error.message}`,
            );
            return {
                message:
                    'If your email exists in our system, a verification code will be sent.',
            };
        }
    }

    @Post('forgot-password')
    async forgotPassword(@Body() body: { email: string }) {
        try {
            const otpCode = await this.customerService.createPasswordResetToken(body.email);
            await this.emailService.sendPasswordResetEmail(body.email, otpCode);
            return {
                message:
                    'If your email exists in our system, you will receive a password reset code',
            };
        } catch (error) {
            this.logger.error(
                `Error sending password reset code to ${body.email}: ${error.message}`,
            );
            return {
                message:
                    'If your email exists in our system, you will receive a password reset code',
            };
        }
    }

    @Post('verify-reset-otp')
    async verifyResetOtp(@Body() body: { email: string; otpCode: string }) {
        try {
            const isValid = await this.customerService.verifyResetOTP(
                body.email,
                body.otpCode,
            );
            return { valid: isValid };
        } catch (error) {
            this.logger.error(
                `Error verifying reset OTP for ${body.email}: ${error.message}`,
            );
            if (error instanceof NotFoundException) {
                return { valid: false, error: 'Invalid OTP code or expired' };
            }
            return { valid: false, error: error.message };
        }
    }

    @Post('reset-password')
    async resetPassword(
        @Body() body: { email: string; otpCode: string; password: string },
    ) {
        try {
            await this.customerService.resetPassword(
                body.email,
                body.otpCode,
                body.password,
            );
            return { message: 'Password reset successful' };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw new NotFoundException('User not found');
            }
            if (error instanceof BadRequestException) {
                throw new BadRequestException(error.message);
            }
            this.logger.error(
                `Error resetting password for user ${body.email}: ${error.message}`,
            );
            throw error;
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@Request() req) {
        return req.user;
    }

    @UseGuards(JwtAuthGuard)
    @Put('profile')
    async updateProfile(@Request() req, @Body() profileData: any) {
        try {
            const updatedCustomer = await this.customerService.updateProfile(
                req.user.userId,
                profileData,
            );
            return updatedCustomer;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw new NotFoundException('User not found');
            }
            if (error instanceof ConflictException) {
                throw new ConflictException(error.message);
            }
            if (error instanceof BadRequestException) {
                throw new BadRequestException(error.message);
            }
            this.logger.error(
                `Error updating profile for user ${req.user.userId}: ${error.message}`,
            );
            throw error;
        }
    }

    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    async changePassword(
        @Request() req,
        @Body() body: { currentPassword: string; newPassword: string },
    ) {
        try {
            await this.customerService.updatePassword(
                req.user.userId,
                body.currentPassword,
                body.newPassword,
            );
            return { message: 'Password changed successfully' };
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw new UnauthorizedException('Invalid current password');
            }
            if (error instanceof BadRequestException) {
                throw new BadRequestException(error.message);
            }
            this.logger.error(
                `Error changing password for user ${req.user.userId}: ${error.message}`,
            );
            throw error;
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('verify-token')
    async verifyToken(@Request() req) {
        return {
            valid: true,
            userId: req.user.id,
            role: req.user.role,
        };
    }

    @Post('refresh')
    async refreshToken(@Body() body: { refreshToken: string }) {
        try {
            return await this.authService.refreshToken(body.refreshToken);
        } catch (error) {
            this.logger.error(`Token refresh failed: ${error.message}`);
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    // @Post('debug/token')
    // @HttpCode(HttpStatus.OK)
    // async debugToken(@Body() body: { token: string }) {
    //     try {
    //         const decoded = this.jwtService.decode(body.token);
    //         return {
    //             success: true,
    //             decoded: decoded,
    //             hasRole: decoded && 'role' in decoded,
    //             role: decoded ? decoded['role'] : null,
    //             hasSub: decoded && 'sub' in decoded,
    //         };
    //     } catch (error) {
    //         this.logger.error(`Token debug failed: ${error.message}`);
    //         return {
    //             success: false,
    //             error: error.message,
    //         };
    //     }
    // }

    @Post('check-verification-status')
    async checkVerificationStatus(@Body() data: { email: string }) {
        try {
            const customer = await this.customerService.findByEmail(data.email);
            if (!customer) {
                return { exists: false, isVerified: false };
            }

            return {
                exists: true,
                isVerified: customer.isEmailVerified,
                status: customer.status,
            };
        } catch (error) {
            this.logger.error(
                `Error checking verification status: ${error.message}`,
            );
            return { error: 'Failed to check verification status' };
        }
    }

    @Get('google')
    @UseGuards(AuthGuard('google'))
    async googleAuth(@Query('redirect') redirect: string) {
        // This endpoint initiates the Google OAuth flow
        // The redirect parameter will be passed back in the state
    }

    @Get('google/callback')
    @UseGuards(AuthGuard('google'))
    async googleAuthCallback(@Request() req, @Res() res) {
        try {
            const result = await this.authService.login(req.user);
            
            // Get redirect URL from state parameter
            const redirectUrl = req.query.state ? decodeURIComponent(req.query.state as string) : 
                (process.env.FRONTEND_URL || 'http://localhost:3000');
            
            // Create URL object with the redirect URL
            const frontendUrl = new URL(redirectUrl);
            frontendUrl.searchParams.set('token', result.access_token);
            frontendUrl.searchParams.set('user', JSON.stringify(result.user));
            
            res.redirect(frontendUrl.toString());
        } catch (error) {
            this.logger.error(`Google callback error: ${error.message}`);
            // Redirect to frontend with error
            const redirectUrl = req.query.state ? decodeURIComponent(req.query.state as string) : 
                (process.env.FRONTEND_URL || 'http://localhost:3000');
            const frontendUrl = new URL(redirectUrl);
            frontendUrl.searchParams.set('error', 'Google authentication failed');
            res.redirect(frontendUrl.toString());
        }
    }
}
