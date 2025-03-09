import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { Customer } from '../customer/customer.entity';
import { Admin } from '../admin/admin.entity';
import { Staff } from '../staff/staff.entity';
import { CustomerModule } from '../customer/customer.module';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: '1d' },
            }),
        }),
        TypeOrmModule.forFeature([Customer, Admin, Staff]),
        CustomerModule, // Import CustomerModule to make CustomerService available
        EmailModule, // Import EmailModule as EmailService is used in AuthService
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, LocalStrategy],
    exports: [AuthService, JwtModule],
})
export class AuthModule {}
