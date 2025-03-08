import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    private readonly logger = new Logger(LocalStrategy.name);

    constructor(private authService: AuthService) {
        super({
            usernameField: 'loginId',
            passwordField: 'password',
        });
    }

    async validate(loginId: string, password: string): Promise<any> {
        this.logger.log(
            `Attempting to authenticate user with loginId: ${loginId}`,
        );

        try {
            const user = await this.authService.validateUsernameOrEmail(
                loginId,
                password,
            );

            if (!user) {
                this.logger.warn(
                    `Authentication failed for loginId: ${loginId} - no user found`,
                );
                throw new UnauthorizedException('Invalid credentials');
            }

            this.logger.log(
                `Authentication successful for user ID: ${user.id}`,
            );
            return user;
        } catch (error) {
            this.logger.error(
                `Authentication failed for loginId: ${loginId}: ${error.message}`,
            );
            throw error;
        }
    }
}
