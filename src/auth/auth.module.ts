import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { CustomerModule } from '../customer/customer.module';
import { EmailModule } from '../email/email.module';
import { AdminModule } from '../admin/admin.module';
import { StaffModule } from '../staff/staff.module';
import { getJwtConstants } from './constants';

@Module({
    imports: [
        PassportModule,
        CustomerModule,
        EmailModule,
        AdminModule,
        StaffModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => {
                const jwtConstants = getJwtConstants(configService);
                return {
                    secret: jwtConstants.secret,
                    signOptions: { expiresIn: jwtConstants.accessTokenExpiry },
                };
            },
            inject: [ConfigService],
        }),
        ConfigModule,
    ],
    controllers: [AuthController],
    providers: [AuthService, LocalStrategy, JwtStrategy, GoogleStrategy],
    exports: [AuthService],
})
export class AuthModule {}
