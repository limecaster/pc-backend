import {
    Injectable,
    ExecutionContext,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    private readonly logger = new Logger(JwtAuthGuard.name);

    canActivate(
        context: ExecutionContext,
    ): boolean | Promise<boolean> | Observable<boolean> {
        const request = context.switchToHttp().getRequest();

        const authHeader = request.headers.authorization;
        if (!authHeader) {
            this.logger.error('Missing Authorization header');
            throw new UnauthorizedException('Authorization header is required');
        }

        return super.canActivate(context);
    }

    handleRequest(err, user, info) {
        if (err) {
            this.logger.error(`JWT validation error: ${err.message}`);
            throw err;
        }

        if (!user) {
            this.logger.error(
                `JWT validation failed: ${info?.message || 'No user found'}`,
            );
            throw new UnauthorizedException('Authentication required');
        }

        if (!user.id) {
            this.logger.error('JWT validation failed - Missing user ID:', user);
            throw new UnauthorizedException('Invalid user identity');
        }

        return user;
    }
}
