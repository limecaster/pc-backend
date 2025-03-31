import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { CustomerService } from '../customer/customer.service';
import { EmailService } from '../email/email.service';
import { AdminService } from '../admin/admin.service';
import { Role } from './enums/role.enum';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private customerService: CustomerService,
        private jwtService: JwtService,
        private emailService: EmailService,
        private configService: ConfigService,
        private adminService: AdminService,
    ) {}

    async validateUser(email: string, password: string): Promise<any> {
        const customer = await this.customerService.findByEmail(email);
        if (!customer) {
            this.logger.error(
                `Validation failed: No user found with email: ${email}`,
            );
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(
            password,
            customer.password,
        );
        if (!isPasswordValid) {
            this.logger.error(
                `Validation failed: Invalid password for email: ${email}`,
            );
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!customer.isEmailVerified) {
            this.logger.error(
                `Validation failed: Email not verified for user ID: ${customer.id}`,
            );
            throw new UnauthorizedException(
                'Please verify your email before logging in',
            );
        }

        if (customer.status !== 'active') {
            this.logger.error(
                `Validation failed: Inactive account for user ID: ${customer.id}`,
            );
            throw new UnauthorizedException(
                'Your account has been deactivated. Please contact support.',
            );
        }

        await this.customerService.updateLoginTimestamp(customer.id);

        const { password: _, ...result } = customer;
        return result;
    }

    async login(user: any) {
        const role = user.role || Role.CUSTOMER;

        if (!user.id) {
            this.logger.error('Login failed: User object missing ID');
            throw new Error('Invalid user data - missing ID');
        }

        const payload = {
            email: user.email,
            sub: user.id,
            role: role,
            ...(user.username && { username: user.username }),
        };

        const token = this.jwtService.sign(payload);

        const refreshToken = this.jwtService.sign(
            { ...payload },
            {
                expiresIn: '7d',
                secret:
                    this.configService.get<string>('JWT_SECRET') ||
                    'refreshSecret',
            },
        );

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
                role: role,
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

        try {
            const name =
                `${userData.firstname || ''} ${userData.lastname || ''}`.trim();
            await this.emailService.sendVerificationEmail(
                userData.email,
                customer.verificationToken,
                name,
            );
        } catch (error) {
            this.logger.error(
                `Failed to send verification email to: ${userData.email}`,
                error.stack,
            );
        }

        const { password: _, ...result } = customer;
        return result;
    }

    async validateUsernameOrEmail(
        loginId: string,
        password: string,
    ): Promise<any> {
        const customer = await this.customerService.findByLoginId(loginId);

        if (!customer) {
            this.logger.error(
                `Validation failed: No user found with loginId: ${loginId}`,
            );
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(
            password,
            customer.password,
        );

        if (!isPasswordValid) {
            this.logger.error(
                `Validation failed: Invalid password for loginId: ${loginId}`,
            );
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!customer.isEmailVerified) {
            this.logger.error(
                `Validation failed: Email not verified for user ID: ${customer.id}`,
            );
            throw new UnauthorizedException(
                'Please verify your email before logging in',
            );
        }

        if (customer.status !== 'active') {
            this.logger.error(
                `Validation failed: Inactive account for user ID: ${customer.id}`,
            );
            throw new UnauthorizedException(
                'Your account has been deactivated. Please contact support.',
            );
        }

        await this.customerService.updateLoginTimestamp(customer.id);

        const { password: _, ...result } = customer;
        return result;
    }

    async validateAdmin(credentials: { username: string; password: string }) {
        const { username, password } = credentials;

        const admin = await this.adminService.findByUsername(username);
        if (!admin) {
            this.logger.error(
                `Validation failed: Admin not found with username: ${username}`,
            );
            throw new UnauthorizedException('Invalid credentials');
        }

        const passwordValid = await this.comparePasswords(
            password,
            admin.password,
        );
        if (!passwordValid) {
            this.logger.error(
                `Validation failed: Invalid password for admin username: ${username}`,
            );
            throw new UnauthorizedException('Invalid credentials');
        }

        const payload = {
            sub: admin.id,
            username: admin.username,
            email: admin.email,
            role: 'admin',
        };

        const accessToken = this.jwtService.sign(payload);
        const refreshToken = this.jwtService.sign(payload, {
            expiresIn: '7d',
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        });

        return {
            accessToken,
            refreshToken,
            admin,
        };
    }

    async comparePasswords(
        plainTextPassword: string,
        hashedPassword: string,
    ): Promise<boolean> {
        return bcrypt.compare(plainTextPassword, hashedPassword);
    }

    async refreshToken(refreshToken: string) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            });

            if (!payload) {
                this.logger.error(
                    'Token refresh failed: Invalid refresh token format',
                );
                throw new UnauthorizedException('Invalid refresh token');
            }

            const { sub, email, role } = payload;

            const newAccessToken = this.jwtService.sign({
                email,
                sub,
                role,
            });

            return {
                access_token: newAccessToken,
            };
        } catch (error) {
            this.logger.error(`Token refresh failed: ${error.message}`);
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
    }
}
