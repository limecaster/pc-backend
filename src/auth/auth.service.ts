import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config'; // Add ConfigService import
import * as bcrypt from 'bcrypt';
import { CustomerService } from '../customer/customer.service';
import { EmailService } from '../email/email.service';
import { AdminService } from '../admin/admin.service'; // Import AdminService
import { Role } from './enums/role.enum';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    
    constructor(
        private customerService: CustomerService,
        private jwtService: JwtService,
        private emailService: EmailService,
        private configService: ConfigService, // Add ConfigService
        private adminService: AdminService, // Add AdminService
    ) {}

    async validateUser(email: string, password: string): Promise<any> {
        const customer = await this.customerService.findByEmail(email);
        if (!customer) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(
            password,
            customer.password,
        );
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Check if email is verified
        if (!customer.isEmailVerified) {
            throw new UnauthorizedException(
                'Please verify your email before logging in',
            );
        }

        // Check if customer status is active
        if (customer.status !== 'active') {
            throw new UnauthorizedException(
                'Your account has been deactivated. Please contact support.',
            );
        }

        // Update login timestamp
        await this.customerService.updateLoginTimestamp(customer.id);

        const { password: _, ...result } = customer;
        return result;
    }

    async login(user: any) {
        // Ensure role is included in the payload and user has an ID
        const role = user.role || Role.CUSTOMER;
        
        if (!user.id) {
            this.logger.error('Login attempted with user object missing ID');
            throw new Error('Invalid user data - missing ID');
        }
        
        this.logger.debug(`Creating token for user ID: ${user.id} with role: ${role}`);
        
        const payload = { 
            email: user.email, 
            sub: user.id, // Make sure to use 'sub' for the ID as expected by the JWT strategy
            role: role,
            // Include username if available
            ...(user.username && { username: user.username }),
        };
        
        // Create standard JWT token
        const token = this.jwtService.sign(payload);
        
        // Generate refresh token as well
        const refreshToken = this.jwtService.sign(
            { ...payload },
            { 
                expiresIn: '7d',
                secret: this.configService.get<string>('JWT_SECRET') || 'refreshSecret'
            }
        );
        
        // Log what we're returning
        this.logger.debug(`Auth login response includes: access_token and user data with role ${role}`);
        
        return {
            access_token: token,
            refresh_token: refreshToken,
            user: {
                id: user.id,
                email: user.email,
                firstname: user.firstname,
                lastname: user.lastname,
                username: user.username,
                avatar: user.avatar,
                phoneNumber: user.phoneNumber,
                role: role,  // Include role in the response
            },
        };
    }

    async register(userData: {
        email: string;
        password: string;
        username?: string;
        firstname?: string;
        lastname?: string;
    }) {
        const customer = await this.customerService.create(userData);

        // Send verification email with OTP
        try {
            const name =
                `${userData.firstname || ''} ${userData.lastname || ''}`.trim();
            await this.emailService.sendVerificationEmail(
                userData.email,
                customer.verificationToken,
                name,
            );
        } catch (error) {
            console.error('Failed to send verification email:', error);
            // Continue with registration even if email sending fails
        }

        const { password: _, ...result } = customer;
        return result;
    }

    async validateUsernameOrEmail(
        loginId: string,
        password: string,
    ): Promise<any> {
        this.logger.debug(`Validating user login with ID: ${loginId}`);
        
        // Use the enhanced flexible lookup method
        const customer = await this.customerService.findByLoginId(loginId);

        if (!customer) {
            this.logger.warn(`Login failed: No user found with loginId: ${loginId}`);
            throw new UnauthorizedException('Invalid credentials');
        }

        this.logger.debug(`Found user with ID: ${customer.id}, verifying password`);
        
        const isPasswordValid = await bcrypt.compare(
            password,
            customer.password,
        );
        
        if (!isPasswordValid) {
            this.logger.warn(`Login failed: Invalid password for user ${customer.id}`);
            throw new UnauthorizedException('Invalid credentials');
        }

        // Check if email is verified
        if (!customer.isEmailVerified) {
            this.logger.warn(`Login failed: Unverified email for user ${customer.id}`);
            throw new UnauthorizedException(
                'Please verify your email before logging in',
            );
        }

        // Check if customer status is active
        if (customer.status !== 'active') {
            this.logger.warn(`Login failed: Inactive account for user ${customer.id}, status: ${customer.status}`);
            throw new UnauthorizedException(
                'Your account has been deactivated. Please contact support.',
            );
        }

        // Update login timestamp
        await this.customerService.updateLoginTimestamp(customer.id);
        
        this.logger.debug(`Successful authentication for user ${customer.id}`);
        
        const { password: _, ...result } = customer;
        return result;
    }

    // Add this method if not already present
    async validateAdmin(credentials: { username: string; password: string }) {
        const { username, password } = credentials;
        
        this.logger.debug(`Validating admin: ${username}`);
        
        const admin = await this.adminService.findByUsername(username);
        if (!admin) {
            this.logger.warn(`Admin not found: ${username}`);
            throw new UnauthorizedException('Invalid credentials');
        }
        
        const passwordValid = await this.comparePasswords(password, admin.password);
        if (!passwordValid) {
            this.logger.warn(`Invalid password for admin: ${username}`);
            throw new UnauthorizedException('Invalid credentials');
        }
        
        // Generate tokens with explicit role claim
        const payload = { 
            sub: admin.id, 
            username: admin.username, 
            email: admin.email,
            role: 'admin'  // Explicitly include the role
        };
        
        const accessToken = this.jwtService.sign(payload);
        const refreshToken = this.jwtService.sign(payload, {
            expiresIn: '7d',
            secret: this.configService.get<string>('JWT_REFRESH_SECRET')
        });
        
        // Save the refresh token if you track them
        // await this.tokenService.saveRefreshToken(admin.id, refreshToken);
        
        this.logger.debug(`Admin ${username} authenticated successfully`);
        
        return {
            accessToken,
            refreshToken,
            admin
        };
    }

    /**
     * Compare a plain text password with a hashed one
     */
    async comparePasswords(plainTextPassword: string, hashedPassword: string): Promise<boolean> {
        return bcrypt.compare(plainTextPassword, hashedPassword);
    }

    /**
     * Refresh an authentication token using a refresh token
     */
    async refreshToken(refreshToken: string) {
        try {
            this.logger.debug('Attempting to refresh token');
            
            // Verify the refresh token with the refresh token secret
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            });
            
            if (!payload) {
                this.logger.warn('Invalid refresh token format');
                throw new UnauthorizedException('Invalid refresh token');
            }

            // Extract user information from payload
            const { sub, email, role } = payload;
            
            this.logger.debug(`Refreshing token for user: ${sub} with role: ${role}`);
            
            // Create a new access token
            const newAccessToken = this.jwtService.sign({
                email,
                sub,
                role,
            });

            // Create a new refresh token if needed (optional)
            // You may want to limit how many times a refresh token can be used
            
            return {
                access_token: newAccessToken,
                // Return a new refresh token if you want to rotate them
                // refresh_token: this.jwtService.sign({ email, sub }, {
                //     expiresIn: '7d',
                //     secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
                // }),
            };
        } catch (error) {
            this.logger.error(`Token refresh failed: ${error.message}`);
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
    }
}
