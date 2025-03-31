import {
    Controller,
    Get,
    UseGuards,
    Logger,
    InternalServerErrorException,
    Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CustomerService } from './customer.service';

@Controller('customers')
export class CustomerController {
    private readonly logger = new Logger(CustomerController.name);

    constructor(private readonly customerService: CustomerService) {}

    // Updated to support search and pagination
    @Get('simple-list')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async getSimpleCustomerList(
        @Query('search') search?: string,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
    ): Promise<{
        customers: { id: string; name: string }[];
        total: number;
        pages: number;
    }> {
        try {
            // Removed non-critical debug log
            return await this.customerService.getSimpleCustomerList(
                search,
                page,
                limit,
            );
        } catch (error) {
            // Keeping critical error log
            this.logger.error(
                `Error retrieving customer list: ${error.message}`,
            );
            throw new InternalServerErrorException(
                'Failed to retrieve customer list',
            );
        }
    }
}
