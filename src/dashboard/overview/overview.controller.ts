import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { OverviewService } from './overview.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('dashboard/overview')
@UseGuards(JwtAuthGuard)
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get()
  async getDashboardOverview(@Request() req) {
    return this.overviewService.getDashboardOverview(req.user.id);
  }
}
