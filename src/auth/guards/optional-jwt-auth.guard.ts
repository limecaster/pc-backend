import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Override handleRequest to prevent throwing an exception if authentication fails
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Return the user without throwing an exception
    return user;
  }
}
