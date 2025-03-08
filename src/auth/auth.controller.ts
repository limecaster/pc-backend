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
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CustomerService } from '../customer/customer.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailService } from '../email/email.service';

@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);
    
    constructor(
        private authService: AuthService,
        private customerService: CustomerService,
        private emailService: EmailService,
    ) {}

    @UseGuards(LocalAuthGuard)
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Request() req) {
        // This will only execute if the LocalAuthGuard passes
        this.logger.log(`User successfully authenticated: ${req.user.id} (${req.user.email})`);
        
        // Log the raw request body for debugging
        this.logger.debug(`Login request body: ${JSON.stringify(req.body)}`);
        
        return this.authService.login(req.user);
    }

    // // Debug endpoint - DO NOT USE IN PRODUCTION
    // @Post('debug-login')
    // async debugLogin(@Body() loginData: { loginId: string, password: string }) {
    //     this.logger.debug(`Debug login attempt for: ${loginData.loginId}`);
        
    //     try {
    //         // Try to find the user
    //         let user = await this.customerService.findByEmail(loginData.loginId);
    //         if (!user) {
    //             user = await this.customerService.findByUsername(loginData.loginId);
    //         }
            
    //         if (user) {
    //             this.logger.debug(`Found user with ID: ${user.id}`);
    //             return { 
    //                 message: "User exists in database", 
    //                 userId: user.id,
    //                 email: user.email,
    //                 username: user.username,
    //                 status: user.status,
    //                 isEmailVerified: user.isEmailVerified
    //             };
    //         } else {
    //             this.logger.debug(`No user found for login ID: ${loginData.loginId}`);
    //             return { message: "User not found in database" };
    //         }
    //     } catch (error) {
    //         this.logger.error(`Debug login error: ${error.message}`);
    //         return { message: "Error during lookup", error: error.message };
    //     }
    // }

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
                // Provide more specific error message for conflicts
                throw new ConflictException(
                    error.message || 'Email or username already exists',
                );
            }
            throw error;
        }
    }

    @Post('verify-email')
    async verifyEmail(@Body() body: { email: string; otpCode: string }) {
        await this.customerService.verifyEmail(body.email, body.otpCode);
        return { message: 'Email verified successfully' };
    }

    @Post('resend-otp')
    async resendOtp(
        @Body() body: { email: string; type: 'verification' | 'reset' },
    ) {
        let otpCode: string;
        let customer;

        try {
            if (body.type === 'verification') {
                otpCode = await this.customerService.resendVerificationOTP(
                    body.email,
                );
                customer = await this.customerService.findByEmail(body.email);

                // Send verification email with OTP
                try {
                    const name =
                        `${customer.firstname || ''} ${customer.lastname || ''}`.trim();
                    await this.emailService.sendVerificationEmail(
                        body.email,
                        otpCode,
                        name,
                    );
                } catch (error) {
                    console.error('Failed to send verification email:', error);
                    // Continue even if email fails
                }
            } else {
                otpCode = await this.customerService.createPasswordResetToken(
                    body.email,
                );
                customer = await this.customerService.findByEmail(body.email);

                // Send password reset email with OTP
                try {
                    const name =
                        `${customer.firstname || ''} ${customer.lastname || ''}`.trim();
                    await this.emailService.sendPasswordResetEmail(
                        body.email,
                        otpCode,
                        name,
                    );
                } catch (error) {
                    console.error(
                        'Failed to send password reset email:',
                        error,
                    );
                    // Continue even if email fails
                }
            }

            return {
                message: 'A new verification code has been sent to your email',
            };
        } catch (error) {
            // Return a generic message to prevent email enumeration
            return {
                message:
                    'If your email exists in our system, a verification code will be sent.',
            };
        }
    }

    @Post('forgot-password')
    async forgotPassword(@Body() body: { email: string }) {
        try {
            const otpCode = await this.customerService.createPasswordResetToken(
                body.email,
            );
            const customer = await this.customerService.findByEmail(body.email);

            // Send password reset email with OTP
            if (customer) {
                try {
                    const name =
                        `${customer.firstname || ''} ${customer.lastname || ''}`.trim();
                    await this.emailService.sendPasswordResetEmail(
                        body.email,
                        otpCode,
                        name,
                    );
                } catch (error) {
                    console.error(
                        'Failed to send password reset email:',
                        error,
                    );
                    // Continue even if email fails
                }
            }

            return {
                message:
                    'If your email exists in our system, you will receive a password reset code',
            };
        } catch (error) {
            // Always return the same message to prevent email enumeration
            return {
                message:
                    'If your email exists in our system, you will receive a password reset code',
            };
        }
    }

    @Post('verify-reset-otp')
    async verifyResetOtp(@Body() body: { email: string; otpCode: string }) {
        const isValid = await this.customerService.verifyResetOTP(
            body.email,
            body.otpCode,
        );
        return { valid: isValid };
    }

    @Post('reset-password')
    async resetPassword(
        @Body() body: { email: string; otpCode: string; password: string },
    ) {
        await this.customerService.resetPassword(
            body.email,
            body.otpCode,
            body.password,
        );
        return { message: 'Password reset successful' };
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@Request() req) {
        return req.user;
    }

    @UseGuards(JwtAuthGuard)
    @Put('profile')
    async updateProfile(@Request() req, @Body() profileData: any) {
        const updatedCustomer = await this.customerService.updateProfile(
            req.user.userId,
            profileData,
        );
        return updatedCustomer;
    }

    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    async changePassword(
        @Request() req,
        @Body() body: { currentPassword: string; newPassword: string },
    ) {
        await this.customerService.updatePassword(
            req.user.userId,
            body.currentPassword,
            body.newPassword,
        );
        return { message: 'Password changed successfully' };
    }

    @UseGuards(JwtAuthGuard)
    @Get('verify-token')
    async verifyToken(@Request() req) {
        // If the guard passes, the token is valid and user exists
        this.logger.debug(`Token verification successful for user: ${req.user.id}`);
        return {
            valid: true,
            userId: req.user.id,
        };
    }

}
