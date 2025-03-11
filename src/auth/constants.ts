// These constants should be loaded from environment variables in production
export const jwtConstants = {
    secret: process.env.JWT_SECRET || 'secretKey',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refreshSecretKey',
    accessTokenExpiry: '1h',
    refreshTokenExpiry: '7d',
};
