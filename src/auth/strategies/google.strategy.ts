import { Strategy } from 'passport-google-oauth20';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    private readonly logger = new Logger(GoogleStrategy.name);

    constructor(
        private readonly authService: AuthService,
        private readonly configService: ConfigService,
    ) {
        super({
            clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
            clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
            callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL'),
            scope: ['email', 'profile'],
            passReqToCallback: true,
        });
    }

    async validate(
        request: any,
        accessToken: string,
        refreshToken: string,
        profile: any,
    ): Promise<any> {
        try {
            const { id, emails, displayName, photos } = profile;
            const email = emails[0].value;
            const name = displayName;
            const avatar = photos[0].value;

            // Split name into first and last name
            const nameParts = name.split(' ');
            const firstname = nameParts[0];
            const lastname = nameParts.slice(1).join(' ');

            // Find or create user
            const user = await this.authService.findOrCreateGoogleUser({
                googleId: id,
                email,
                firstname,
                lastname,
                avatar,
            });

            if (!user) {
                throw new UnauthorizedException('Failed to authenticate with Google');
            }

            return user;
        } catch (error) {
            this.logger.error(`Google authentication failed: ${error.message}`);
            throw error;
        }
    }
} 