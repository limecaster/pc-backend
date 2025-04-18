import { ConfigService } from '@nestjs/config';

// Function to get JWT constants using ConfigService
export const getJwtConstants = (configService: ConfigService) => ({
    secret: configService.get<string>('JWT_SECRET') || 'secretKey',
    refreshSecret:
        configService.get<string>('JWT_REFRESH_SECRET') || 'refreshSecretKey',
    accessTokenExpiry: configService.get<string>('JWT_EXPIRATION')
        ? `${parseInt(configService.get<string>('JWT_EXPIRATION'))}`
        : '1h',
    refreshTokenExpiry: '7d',
});

// For backward compatibility and direct imports
export const jwtConstants = {
    secret: process.env.JWT_SECRET || 'secretKey',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refreshSecretKey',
    accessTokenExpiry: process.env.JWT_EXPIRATION
        ? `${parseInt(process.env.JWT_EXPIRATION)}`
        : '1h',
    refreshTokenExpiry: '7d',
};
