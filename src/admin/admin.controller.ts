import {
    Controller,
    Get,
    UseGuards,
    Body,
    Post,
    Request,
    Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { AdminService } from './admin.service';
import { StaffService } from '../staff/staff.service';

@Controller('admin')
// Remove the class-level guards and apply them to specific methods instead
export class AdminController {
    private readonly logger = new Logger(AdminController.name);

    constructor(
        private readonly adminService: AdminService,
        private readonly staffService: StaffService,
    ) {}

    @Get('dashboard')
    @UseGuards(JwtAuthGuard, RolesGuard) // Apply guards at method level
    @Roles(Role.ADMIN)
    async getDashboard() {
        return { message: 'Admin dashboard data' };
    }

    @Get('orders')
    @UseGuards(JwtAuthGuard, RolesGuard) // Apply guards at method level
    @Roles(Role.ADMIN, Role.STAFF)
    async getOrders() {
        return { message: 'Orders list accessible by both admin and staff' };
    }

    @Post('create-admin')
    @UseGuards(JwtAuthGuard, RolesGuard) // Apply guards at method level
    @Roles(Role.ADMIN)
    async createAdmin(@Body() adminData: any, @Request() req) {
        this.logger.log(`Admin ${req.user.id} creating new admin account`);
        return this.adminService.createAdmin(adminData);
    }

    @Post('create-staff')
    @UseGuards(JwtAuthGuard, RolesGuard) // Apply guards at method level
    @Roles(Role.ADMIN)
    async createStaff(@Body() staffData: any, @Request() req) {
        this.logger.log(`Admin ${req.user.id} creating new staff account`);
        return this.staffService.createStaff(staffData);
    }

    // Note: No guards on this endpoint - it's public
    @Post('setup-first-admin')
    async setupFirstAdmin(@Body() adminData: any) {
        const adminsCount = await this.adminService.getAdminCount();

        // Only allow creating the first admin
        if (adminsCount > 0) {
            return { success: false, message: 'Initial admin already exists' };
        }

        this.logger.log('Setting up initial admin account');
        return this.adminService.createAdmin(adminData);
    }

    // Note: No guards on this endpoint - it's public
    @Post('register/initial')
    async registerInitialAdmin(@Body() adminData: any & { secretKey: string }) {
        const configuredKey = process.env.ADMIN_SETUP_SECRET_KEY;

        this.logger.debug('Attempting to register initial admin');

        // Verify the secret key
        if (!configuredKey || adminData.secretKey !== configuredKey) {
            this.logger.warn(
                'Attempt to register initial admin with invalid secret key',
            );
            return {
                success: false,
                message: 'Invalid or missing secret key',
            };
        }

        // Check if any admin already exists
        const adminsCount = await this.adminService.getAdminCount();

        if (adminsCount > 0) {
            this.logger.warn(
                'Attempt to register initial admin when admin already exists',
            );
            return {
                success: false,
                message: 'Initial admin already exists',
            };
        }

        try {
            // Create the admin account
            const { secretKey, ...adminInfo } = adminData;
            const result = await this.adminService.createAdmin(adminInfo);

            this.logger.log('Initial admin account registered successfully');

            return {
                success: true,
                message: 'Initial admin registered successfully',
                admin: result.admin,
            };
        } catch (error) {
            this.logger.error(
                `Failed to register initial admin: ${error.message}`,
            );
            return {
                success: false,
                message: error.message || 'Failed to register initial admin',
            };
        }
    }
}
