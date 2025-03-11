import { 
    Controller, 
    Get, 
    Post, 
    Param, 
    UseGuards, 
    Request, 
    Logger,
    NotFoundException,
    ForbiddenException,
    Body
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
@Roles(Role.STAFF)
export class StaffController {
    private readonly logger = new Logger(StaffController.name);

    constructor(
        private readonly staffService: StaffService,
        private readonly orderService: OrderService
    ) {}

    @Get('profile')
    async getStaffProfile(@Request() req) {
        const staffId = req.user.id;
        this.logger.log(`Staff ${staffId} retrieving their profile`);
        
        const staffProfile = await this.staffService.findStaffById(staffId);
        if (!staffProfile) {
            throw new NotFoundException('Staff profile not found');
        }
        
        return {
            success: true,
            profile: staffProfile
        };
    }

    @Get('pending-orders')
    async getPendingOrders() {
        this.logger.log('Staff retrieving pending orders');
        try {
            const pendingOrders = await this.orderService.findPendingApprovalOrders();
            
            return {
                success: true,
                orders: pendingOrders
            };
        } catch (error) {
            this.logger.error(`Error fetching pending orders: ${error.message}`);
            return {
                success: false,
                message: error.message || 'Failed to fetch pending orders'
            };
        }
    }

    @Post('orders/:orderId/approve')
    async approveOrder(@Param('orderId') orderId: string, @Request() req) {
        const staffId = req.user.id;
        this.logger.log(`Staff ${staffId} approving order ${orderId}`);
        
        try {
            // Verify the order exists and is in pending_approval status
            const order = await this.orderService.findOrderWithItems(parseInt(orderId));
            
            if (!order) {
                throw new NotFoundException(`Order with ID ${orderId} not found`);
            }
            
            if (order.status !== OrderStatus.PENDING_APPROVAL) {
                throw new ForbiddenException(`Order is not in pending approval status. Current status: ${order.status}`);
            }

            // Update order status to APPROVED and set approvedBy to the staff ID
            const updatedOrder = await this.orderService.updateOrderStatus(
                parseInt(orderId),
                OrderStatus.APPROVED,
                staffId
            );
            
            this.logger.log(`Order ${orderId} approved successfully by staff ${staffId}`);
            
            return {
                success: true,
                order: updatedOrder,
                message: 'Order approved successfully'
            };
        } catch (error) {
            this.logger.error(`Error approving order ${orderId}: ${error.message}`);
            
            return {
                success: false,
                message: error.message || 'Failed to approve order'
            };
        }
    }

    @Post('orders/:orderId/reject')
    async rejectOrder(
        @Param('orderId') orderId: string, 
        @Body() data: { reason: string },
        @Request() req
    ) {
        const staffId = req.user.id;
        this.logger.log(`Staff ${staffId} rejecting order ${orderId} with reason: ${data.reason}`);
        
        try {
            // Verify the order exists and is in pending_approval status
            const order = await this.orderService.findOrderWithItems(parseInt(orderId));
            
            if (!order) {
                throw new NotFoundException(`Order with ID ${orderId} not found`);
            }
            
            if (order.status !== OrderStatus.PENDING_APPROVAL) {
                throw new ForbiddenException(`Order is not in pending approval status. Current status: ${order.status}`);
            }

            // Update order status to CANCELLED 
            const updatedOrder = await this.orderService.updateOrderStatus(
                parseInt(orderId),
                OrderStatus.CANCELLED,
                staffId
            );
            
            // Here you could also store the rejection reason in a notes field or separate table
            
            this.logger.log(`Order ${orderId} rejected by staff ${staffId}`);
            
            return {
                success: true,
                order: updatedOrder,
                message: 'Order rejected successfully'
            };
        } catch (error) {
            this.logger.error(`Error rejecting order ${orderId}: ${error.message}`);
            
            return {
                success: false,
                message: error.message || 'Failed to reject order'
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
                }
            };
        } catch (error) {
            this.logger.error(`Error retrieving dashboard stats: ${error.message}`);
            return {
                success: false,
                message: error.message || 'Failed to retrieve dashboard statistics'
            };
        }
    }

    // This endpoint allows admins to register new staff members
    @Post('register')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async registerStaff(
        @Body() staffData: {
            username: string;
            email: string;
            password: string;
            firstname: string;
            lastname: string;
            phoneNumber?: string;
        },
        @Request() req
    ) {
        try {
            this.logger.log(`Admin ${req.user.id} registering new staff account for ${staffData.email}`);
            
            const result = await this.staffService.createStaff(staffData);
            
            return {
                success: true,
                message: 'Staff account created successfully',
                staff: result.staff
            };
        } catch (error) {
            this.logger.error(`Failed to register staff: ${error.message}`);
            return {
                success: false,
                message: error.message || 'Failed to create staff account'
            };
        }
    }
}
