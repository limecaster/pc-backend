import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {

  @Get('dashboard')
  @Roles(Role.ADMIN)
  async getDashboard() {
    return { message: 'Admin dashboard data' };
  }

  @Get('orders')
  @Roles(Role.ADMIN, Role.STAFF)
  async getOrders() {
    return { message: 'Orders list accessible by both admin and staff' };
  }
}
