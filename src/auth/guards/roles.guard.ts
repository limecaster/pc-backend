import {
    Injectable,
    CanActivate,
    ExecutionContext,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    private readonly logger = new Logger(RolesGuard.name);

    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredRoles) {
            return true;
        }

        const { user } = context.switchToHttp().getRequest();

        if (!user || !user.role) {
            this.logger.warn('Unauthorized access attempt without user role');
            return false;
        }

        this.logger.debug(
            `Checking if role ${user.role} is in ${requiredRoles.join(', ')}`,
        );
        const hasRequiredRole = requiredRoles.some(
            (role) => user.role === role,
        );

        if (!hasRequiredRole) {
            this.logger.warn(
                `User ${user.id} with role ${user.role} attempted to access resource requiring roles: ${requiredRoles.join(', ')}`,
            );
        }

        return hasRequiredRole;
    }
}
