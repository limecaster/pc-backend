import {
    Controller,
    Get,
    Param,
    Query,
    UseGuards,
    Patch,
    Body,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { CustomerService } from './customer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { OrderService } from '../order/order.service';

@Controller('customers/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class CustomerAdminController {
    private readonly logger = new Logger(CustomerAdminController.name);

    constructor(
        private readonly customerService: CustomerService,
        private readonly orderService: OrderService,
    ) {}

    @Get('all')
    async getAllCustomers(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Query('search') search?: string,
        @Query('status') status?: string,
        @Query('sortBy') sortBy: string = 'createdAt',
        @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC',
    ) {
        try {
            const result = await this.customerService.findAllCustomers({
                page,
                limit,
                search,
                status,
                sortBy,
                sortOrder,
            });

            return {
                success: true,
                customers: result.customers,
                total: result.total,
                pages: result.pages,
                currentPage: page,
            };
        } catch (error) {
            this.logger.error(`Error fetching all customers: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    @Get(':id')
    async getCustomerById(@Param('id') id: string) {
        try {
            const customerId = parseInt(id);
            if (isNaN(customerId)) {
                throw new BadRequestException('Invalid customer ID');
            }

            const customer = await this.customerService.findOne(customerId);
            if (!customer) {
                throw new NotFoundException(`Customer with ID ${id} not found`);
            }

            return {
                success: true,
                customer,
            };
        } catch (error) {
            this.logger.error(
                `Error fetching customer ${id}: ${error.message}`,
            );
            return {
                success: false,
                message: error.message,
            };
        }
    }

    @Patch(':id/status')
    async updateCustomerStatus(
        @Param('id') id: string,
        @Body() body: { status: string },
    ) {
        try {
            const customerId = parseInt(id);
            if (isNaN(customerId)) {
                throw new BadRequestException('Invalid customer ID');
            }

            const { status } = body;
            if (!status) {
                throw new BadRequestException('Status is required');
            }

            // Check for valid status values
            const validStatuses = ['active', 'inactive', 'banned'];
            if (!validStatuses.includes(status)) {
                throw new BadRequestException(
                    `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
                );
            }

            const customer = await this.customerService.updateStatus(
                customerId,
                status,
            );

            return {
                success: true,
                customer,
            };
        } catch (error) {
            this.logger.error(
                `Error updating customer ${id} status: ${error.message}`,
            );
            return {
                success: false,
                message: error.message,
            };
        }
    }
}
