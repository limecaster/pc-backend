import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from '../customer/customer.module';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { AuthController } from './auth.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    UserModule,
    EmailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get('JWT_SECRET');
        console.log('JWT Secret (first 5 chars):', secret?.substring(0, 5) + '...');
        
        if (!secret) {
          console.error('WARNING: JWT_SECRET is not defined in the environment!');
        }
        
        return {
          secret: secret || 'default_secret_for_development_only',
          signOptions: { 
            expiresIn: '24h',
            algorithm: 'HS256' // Explicitly set algorithm
          },
          verifyOptions: {
            algorithms: ['HS256'] // Match algorithms for sign and verify
          }
        };
      },
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
