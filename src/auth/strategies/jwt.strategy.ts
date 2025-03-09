import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../customer/customer.entity';
import { Admin } from '../../admin/admin.entity';
import { Staff } from '../../staff/staff.entity';
import { Role } from '../enums/role.enum';
import { CustomerService } from '../../customer/customer.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    private readonly logger = new Logger(JwtStrategy.name);
    
    constructor(
        @InjectRepository(Customer)
        private customerRepository: Repository<Customer>,
        @InjectRepository(Admin)
        private adminRepository: Repository<Admin>,
        @InjectRepository(Staff)
        private staffRepository: Repository<Staff>,
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
            // Check the user type from payload
            const { id, userType } = payload;
            
            let user;
            let role: Role;
            
            if (userType === 'admin') {
                user = await this.adminRepository.findOne({ where: { id } });
                role = Role.ADMIN;
            } else if (userType === 'staff') {
                user = await this.staffRepository.findOne({ where: { id } });
                role = Role.STAFF;
            } else {
                // Default is customer
                user = await this.customerRepository.findOne({ where: { id } });
                role = Role.CUSTOMER;
            }
            
            if (!user) {
                throw new UnauthorizedException('User not found');
            }
            
            // Add role to the user object for RolesGuard
            return { ...user, role };
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
