import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CustomerService } from '../customer/customer.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    
    constructor(
        private customerService: CustomerService,
        private jwtService: JwtService,
        private emailService: EmailService,
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

    async login(customer: any) {
        const payload = { email: customer.email, sub: customer.id };
        this.logger.debug(`Creating token for user ID: ${customer.id}`);
        
        // Create standard JWT token without 'Bearer' prefix
        const token = this.jwtService.sign(payload);
        
        return {
            access_token: token, // Don't add 'Bearer' prefix here
            user: {
                id: customer.id,
                email: customer.email,
                firstname: customer.firstname,
                lastname: customer.lastname,
                username: customer.username,
                avatar: customer.avatar,
                phoneNumber: customer.phoneNumber,
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
}
