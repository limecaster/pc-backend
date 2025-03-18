import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    UseGuards,
    Request,
    Logger,
    NotFoundException,
    ForbiddenException,
    Body,
    Query,
    HttpStatus,
    HttpCode,
    ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { StaffService } from './staff.service';
import { OrderService } from '../order/order.service';
import { OrderStatus } from '../order/order.entity';

@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffController {
    private readonly logger = new Logger(StaffController.name);

    constructor(
        private readonly staffService: StaffService,
        private readonly orderService: OrderService,
    ) {}

    // Staff-specific endpoints (any staff can access)
    @Get('profile')
    @Roles(Role.STAFF, Role.ADMIN)
    async getStaffProfile(@Request() req) {
        const staffId = req.user.id;
        this.logger.log(`Staff ${staffId} retrieving their profile`);

        const staffProfile = await this.staffService.findStaffById(staffId);
        if (!staffProfile) {
            throw new NotFoundException('Staff profile not found');
        }

        return {
            success: true,
            profile: staffProfile,
        };
    }

    // Admin-only endpoints for staff management
    @Get('all')
    @Roles(Role.ADMIN)
    async getAllStaff(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
    ) {
        this.logger.log(`Admin retrieving all staff members (page ${page})`);

        const result = await this.staffService.findAll(page, limit);

        return {
            success: true,
            staff: result.staff,
            total: result.total,
            pages: result.pages,
            page,
        };
    }

    @Get(':id')
    @Roles(Role.ADMIN)
    async getStaffById(@Param('id', ParseIntPipe) id: number) {
        this.logger.log(`Admin retrieving staff member ${id}`);

        const staff = await this.staffService.findStaffById(id);

        return {
            success: true,
            staff,
        };
    }

    @Post()
    @Roles(Role.ADMIN)
    async createStaff(
        @Body()
        staffData: {
            username: string;
            email: string;
            password: string;
            firstname: string;
            lastname: string;
            phoneNumber?: string;
            role?: string;
        },
    ) {
        this.logger.log(
            `Admin creating new staff account for ${staffData.email}`,
        );

        const result = await this.staffService.createStaff(staffData);

        return {
            success: true,
            message: 'Staff account created successfully',
            staff: result.staff,
        };
    }

    @Put(':id')
    @Roles(Role.ADMIN)
    async updateStaff(
        @Param('id', ParseIntPipe) id: number,
        @Body()
        staffData: {
            firstname?: string;
            lastname?: string;
            email?: string;
            phoneNumber?: string;
            role?: string;
            status?: string;
            street?: string;
            ward?: string;
            district?: string;
            city?: string;
            password?: string;
        },
    ) {
        this.logger.log(`Admin updating staff member ${id}`);

        const updatedStaff = await this.staffService.updateStaff(id, staffData);

        return {
            success: true,
            message: 'Staff account updated successfully',
            staff: updatedStaff,
        };
    }

    @Delete(':id')
    @Roles(Role.ADMIN)
    @HttpCode(HttpStatus.OK)
    async deleteStaff(@Param('id', ParseIntPipe) id: number) {
        this.logger.log(`Admin deleting staff member ${id}`);

        await this.staffService.deleteStaff(id);

        return {
            success: true,
            message: 'Staff account deleted successfully',
        };
    }

    @Post(':id/deactivate')
    @Roles(Role.ADMIN)
    async deactivateStaff(@Param('id', ParseIntPipe) id: number) {
        this.logger.log(`Admin deactivating staff member ${id}`);

        const staff = await this.staffService.deactivateStaff(id);

        return {
            success: true,
            message: 'Staff account deactivated successfully',
            staff,
        };
    }

    @Post(':id/activate')
    @Roles(Role.ADMIN)
    async activateStaff(@Param('id', ParseIntPipe) id: number) {
        this.logger.log(`Admin activating staff member ${id}`);

        const staff = await this.staffService.activateStaff(id);

        return {
            success: true,
            message: 'Staff account activated successfully',
            staff,
        };
    }

    @Get('pending-orders')
    async getPendingOrders() {
        this.logger.log('Staff retrieving pending orders');
        try {
            const pendingOrders =
                await this.orderService.findPendingApprovalOrders();

            return {
                success: true,
                orders: pendingOrders,
            };
        } catch (error) {
            this.logger.error(
                `Error fetching pending orders: ${error.message}`,
            );
            return {
                success: false,
                message: error.message || 'Failed to fetch pending orders',
            };
        }
    }

    @Post('orders/:orderId/approve')
    async approveOrder(@Param('orderId') orderId: string, @Request() req) {
        const staffId = req.user.id;
        this.logger.log(`Staff ${staffId} approving order ${orderId}`);

        try {
            // Verify the order exists and is in pending_approval status
            const order = await this.orderService.findOrderWithItems(
                parseInt(orderId),
            );

            if (!order) {
                throw new NotFoundException(
                    `Order with ID ${orderId} not found`,
                );
            }

            if (order.status !== OrderStatus.PENDING_APPROVAL) {
                throw new ForbiddenException(
                    `Order is not in pending approval status. Current status: ${order.status}`,
                );
            }

            // Update order status to APPROVED and set approvedBy to the staff ID
            const updatedOrder = await this.orderService.updateOrderStatus(
                parseInt(orderId),
                OrderStatus.APPROVED,
                staffId,
            );

            this.logger.log(
                `Order ${orderId} approved successfully by staff ${staffId}`,
            );

            return {
                success: true,
                order: updatedOrder,
                message: 'Order approved successfully',
            };
        } catch (error) {
            this.logger.error(
                `Error approving order ${orderId}: ${error.message}`,
            );

            return {
                success: false,
                message: error.message || 'Failed to approve order',
            };
        }
    }

    @Post('orders/:orderId/reject')
    async rejectOrder(
        @Param('orderId') orderId: string,
        @Body() data: { reason: string },
        @Request() req,
    ) {
        const staffId = req.user.id;
        this.logger.log(
            `Staff ${staffId} rejecting order ${orderId} with reason: ${data.reason}`,
        );

        try {
            // Verify the order exists and is in pending_approval status
            const order = await this.orderService.findOrderWithItems(
                parseInt(orderId),
            );

            if (!order) {
                throw new NotFoundException(
                    `Order with ID ${orderId} not found`,
                );
            }

            if (order.status !== OrderStatus.PENDING_APPROVAL) {
                throw new ForbiddenException(
                    `Order is not in pending approval status. Current status: ${order.status}`,
                );
            }

            // Update order status to CANCELLED
            const updatedOrder = await this.orderService.updateOrderStatus(
                parseInt(orderId),
                OrderStatus.CANCELLED,
                staffId,
            );

            // Here you could also store the rejection reason in a notes field or separate table

            this.logger.log(`Order ${orderId} rejected by staff ${staffId}`);

            return {
                success: true,
                order: updatedOrder,
                message: 'Order rejected successfully',
            };
        } catch (error) {
            this.logger.error(
                `Error rejecting order ${orderId}: ${error.message}`,
            );

            return {
                success: false,
                message: error.message || 'Failed to reject order',
            };
        }
    }

    @Get('dashboard')
    async getDashboardStats() {
        this.logger.log('Staff retrieving dashboard statistics');

        try {
            // You can implement statistics collection here
            // For example:
            // const pendingOrdersCount = await this.orderService.countOrdersByStatus(OrderStatus.PENDING_APPROVAL);
            // const approvedOrdersCount = await this.orderService.countOrdersByStatus(OrderStatus.APPROVED);
            // ... etc.

            return {
                success: true,
                stats: {
                    pendingOrders: 0, // Replace with actual count
                    approvedOrders: 0, // Replace with actual count
                    processingOrders: 0, // Replace with actual count
                    shippingOrders: 0, // Replace with actual count
                    // Add more stats as needed
                },
            };
        } catch (error) {
            this.logger.error(
                `Error retrieving dashboard stats: ${error.message}`,
            );
            return {
                success: false,
                message:
                    error.message || 'Failed to retrieve dashboard statistics',
            };
        }
    }
}
