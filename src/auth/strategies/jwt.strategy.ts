import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerService } from '../../customer/customer.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    private readonly logger = new Logger(JwtStrategy.name);
    
    constructor(
        private configService: ConfigService,
        private customerService: CustomerService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET') || 'default_secret_for_development_only', // Use same default as auth module
            algorithms: ['HS256'], // Explicitly set algorithm
            passReqToCallback: true,
        });

        const jwtSecret = configService.get<string>('JWT_SECRET');
        
        // Log the secret's first few characters to help with debugging
        this.logger.debug(`JWT Strategy initialized with secret: ${jwtSecret?.substring(0, 5)}...`);
        
        if (!jwtSecret) {
            this.logger.error('JWT_SECRET is not defined! Using fallback secret.');
        }
    }

    async validate(request: any, payload: any) {
        this.logger.debug(`JWT Auth headers: ${request.headers.authorization?.substring(0, 20)}...`);
        
        if (!payload || !payload.sub) {
            this.logger.error('Invalid token payload - missing sub field');
            throw new UnauthorizedException('Invalid token payload');
        }

        try {
            // First try to find the user
            const user = await this.customerService.findOne(payload.sub);
            if (!user) {
                // If we couldn't find the user ID in the database
                const errorMsg = `User with ID ${payload.sub} not found. This could mean the account was deleted.`;
                this.logger.error(errorMsg);
                throw new UnauthorizedException('User not found or account deleted. Please log in again.');
            }

            // Check if the user is valid for authentication
            const isValidUser = await this.customerService.isValidForAuth(payload.sub);
            if (!isValidUser) {
                this.logger.error(`User with ID ${payload.sub} exists but is not valid for authentication`);
                throw new UnauthorizedException('Your account is inactive or unverified.');
            }

            return { 
                id: user.id, 
                username: payload.email || user.username,
                email: user.email 
            };
        } catch (error) {
            // If it's already an UnauthorizedException, just rethrow it
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            
            this.logger.error(`Error validating user: ${error.message}`);
            throw new InternalServerErrorException('Authentication failed due to a server error.');
        }
    }
}
