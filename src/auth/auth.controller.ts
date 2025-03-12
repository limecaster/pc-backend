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
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { CustomerService } from '../customer/customer.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailService } from '../email/email.service';
import { StaffService } from '../staff/staff.service';
import { AdminService } from '../admin/admin.service';
import { Role } from './enums/role.enum';

@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);
    
    constructor(
        private authService: AuthService,   
        private customerService: CustomerService,
        private emailService: EmailService,
        private staffService: StaffService,
        private adminService: AdminService,
        private jwtService: JwtService, // Add for debug token
    ) {}

    @UseGuards(LocalAuthGuard)
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Request() req) {
        // This will only execute if the LocalAuthGuard passes
        this.logger.log(`User successfully authenticated: ${req.user.id} (${req.user.email}) with role: ${req.user.role}`);
        
        // Log the raw request body for debugging
        this.logger.debug(`Login request body: ${JSON.stringify(req.body)}`);
        
        // Return JWT token and user info including role
        return this.authService.login(req.user);
    }

    // Staff-specific login endpoint for better logging and control
    @Post('staff/login')
    @HttpCode(HttpStatus.OK)
    async staffLogin(@Body() loginData: { username: string; password: string }) {
        this.logger.log(`Staff login attempt: ${loginData.username}`);
        
        try {
            const staff = await this.staffService.validateStaff(loginData.username, loginData.password);
            
            // If we got here, validation was successful - create token with staff role
            const result = this.authService.login({
                ...staff,
                role: Role.STAFF
            });
            
            this.logger.log(`Staff login successful for: ${loginData.username}`);
            return result;
        } catch (error) {
            this.logger.error(`Staff login error for ${loginData.username}: ${error.message}`);
            
            // Throw proper HTTP exceptions with status codes
            if (error instanceof UnauthorizedException) {
                throw new UnauthorizedException('Invalid staff credentials');
            }
            
            throw new UnauthorizedException('Failed to authenticate staff');
        }
    }

    // Admin-specific login endpoint
    @Post('admin/login')
    @HttpCode(HttpStatus.OK)
    async adminLogin(@Body() loginData: { username: string; password: string }) {
        this.logger.log(`Admin login attempt: ${loginData.username}`);
        
        try {
            const admin = await this.adminService.validateAdmin(loginData.username, loginData.password);
            
            // If we got here, validation was successful - create token with admin role
            const result = this.authService.login({
                ...admin,
                role: Role.ADMIN
            });
            
            this.logger.log(`Admin login successful for: ${loginData.username}`);
            
            // Log the token structure to help debug
            this.logger.debug(`Generated token with payload containing role: ${Role.ADMIN}`);
            
            return result;
        } catch (error) {
            this.logger.error(`Admin login error for ${loginData.username}: ${error.message}`);
            
            throw new UnauthorizedException('Invalid admin credentials');
        }
    }

    // Unified login endpoint for all user types
    @Post('unified-login')
    @HttpCode(HttpStatus.OK)
    async unifiedLogin(@Body() loginData: { username: string; password: string }) {
        this.logger.log(`Unified login attempt for: ${loginData.username}`);
        
        try {
            // Try to authenticate as admin first
            try {
                const admin = await this.adminService.validateAdmin(loginData.username, loginData.password);
                if (admin) {
                    const result = this.authService.login({
                        ...admin,
                        role: Role.ADMIN
                    });
                    this.logger.log(`Admin login successful for: ${loginData.username}`);
                    return result;
                }
            } catch (adminError) {
                // Not an admin, continue to next role check
                this.logger.debug(`Not an admin: ${adminError.message}`);
            }
            
            // Try to authenticate as staff
            try {
                const staff = await this.staffService.validateStaff(loginData.username, loginData.password);
                if (staff) {
                    const result = this.authService.login({
                        ...staff,
                        role: Role.STAFF
                    });
                    this.logger.log(`Staff login successful for: ${loginData.username}`);
                    return result;
                }
            } catch (staffError) {
                // Not staff, continue to customer check
                this.logger.debug(`Not staff: ${staffError.message}`);
            }
            
            // Try to authenticate as customer
            try {
                const customer = await this.customerService.validateCustomer(loginData.username, loginData.password);
                if (customer) {
                    const result = this.authService.login({
                        ...customer,
                        role: Role.CUSTOMER
                    });
                    this.logger.log(`Customer login successful for: ${loginData.username}`);
                    return result;
                }
            } catch (customerError) {
                // Not a customer
                this.logger.debug(`Not a customer: ${customerError.message}`);
            }
            
            // If we reached here, authentication failed for all roles
            throw new UnauthorizedException('Invalid credentials');
        } catch (error) {
            this.logger.error(`Login error for ${loginData.username}: ${error.message}`);
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
                // Provide more specific error message for conflicts
                throw new ConflictException(
                    error.message || 'Email or username already exists',
                );
            }
            throw error;
        }
    }

    @Post('verify-email')
    async verifyEmail(
        @Body() verifyData: { email: string; otpCode: string }
    ) {
        try {
            const verifiedUser = await this.customerService.verifyEmail(
                verifyData.email,
                verifyData.otpCode
            );
            
            return {
                success: true,
                message: 'Email verified successfully',
                user: {
                    id: verifiedUser.id,
                    email: verifiedUser.email,
                    status: verifiedUser.status,
                    isEmailVerified: verifiedUser.isEmailVerified
                }
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw new BadRequestException(error.message);
            }
            throw error;
        }
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
        // Log the role for debugging
        this.logger.debug(`User ${req.user.id} with role ${req.user.role} accessed profile`);
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
        this.logger.debug(`Token verification successful for user: ${req.user.id} with role: ${req.user.role}`);
        return {
            valid: true,
            userId: req.user.id,
            role: req.user.role,
        };
    }

    @Post('refresh')
    async refreshToken(@Body() body: { refreshToken: string }) {
        try {
            this.logger.debug('Token refresh requested');
            const result = await this.authService.refreshToken(body.refreshToken);
            this.logger.debug('Token refresh successful');
            return result;
        } catch (error) {
            this.logger.error(`Token refresh failed: ${error.message}`);
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    // Debug endpoint to check token structure - only enable during development!
    @Post('debug/token')
    @HttpCode(HttpStatus.OK)
    async debugToken(@Body() body: { token: string }) {
        try {
            // Decode without verification
            const decoded = this.jwtService.decode(body.token);
            // Don't log the entire token in production!
            this.logger.debug(`Token decode result: ${JSON.stringify(decoded)}`);
            
            return {
                success: true,
                decoded: decoded,
                hasRole: decoded && 'role' in decoded,
                role: decoded ? decoded['role'] : null,
                hasSub: decoded && 'sub' in decoded,
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

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
                status: customer.status 
            };
        } catch (error) {
            this.logger.error(`Error checking verification status: ${error.message}`);
            return { error: "Failed to check verification status" };
        }
    }
}
