import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerService } from '../../customer/customer.service';
import { Role } from '../enums/role.enum';
import { getJwtConstants } from '../constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    private readonly logger = new Logger(JwtStrategy.name);

    constructor(
        private configService: ConfigService,
        private customerService: CustomerService,
    ) {
        const jwtConstants = getJwtConstants(configService);
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: jwtConstants.secret,
        });
    }

    async validate(payload: any) {
        // Check if payload contains required fields
        if (!payload.sub) {
            this.logger.error('JWT payload missing user ID');
            throw new UnauthorizedException('Invalid token structure');
        }

        // For staff and admin roles, we could validate against their respective services
        if (payload.role === Role.STAFF || payload.role === Role.ADMIN) {
            return {
                id: payload.sub,
                username: payload.username,
                email: payload.email,
                role: payload.role || 'customer', // Default to customer if no role provided
            };
        }

        // For customers, validate that they exist in the database
        const user = await this.customerService.findById(payload.sub);
        if (!user) {
            this.logger.error(
                `User with ID ${payload.sub} not found in database`,
            );
            throw new UnauthorizedException('User not found');
        }

        // Return user data with role information
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstname || user.firstname,
            lastName: user.lastname || user.lastname,
            role: payload.role || Role.CUSTOMER, // Preserve role from token or default to CUSTOMER
        };
    }
}
