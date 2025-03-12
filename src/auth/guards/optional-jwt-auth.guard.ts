import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user, info) {
    // If authentication failed, user will be undefined
    // Instead of throwing an error, we just return undefined
    // which means authentication is optional
    return user;
  }
}
