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
        // Log the incoming request for debugging
        const request = context.switchToHttp().getRequest();
        this.logger.debug(
            `JWT guard checking request to: ${request.method} ${request.url}`,
        );

        // Check if Authorization header exists
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            this.logger.error('Missing Authorization header');
            throw new UnauthorizedException('Authorization header is required');
        }

        // Log Authorization header format (partially)
        this.logger.debug(
            `Auth header format: ${authHeader.substring(0, 10)}... (length: ${authHeader.length})`,
        );

        return super.canActivate(context);
    }

    handleRequest(err, user, info) {
        // If there's an error or no user, throw an exception with detailed info
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

        // Ensure user has an ID - this is critical for the cart API
        if (!user.id) {
            this.logger.error('JWT validation failed - Missing user ID:', user);
            throw new UnauthorizedException('Invalid user identity');
        }

        // Log successful authentication
        this.logger.debug(`User authenticated: ${user.id}`);

        return user;
    }
}
