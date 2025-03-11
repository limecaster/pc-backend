import {
    Injectable,
    Logger,
    NotFoundException,
    UnauthorizedException,
    ConflictException,
    InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Staff } from './staff.entity';

@Injectable()
export class StaffService {
    private readonly logger = new Logger(StaffService.name);

    constructor(
        @InjectRepository(Staff)
        private staffRepository: Repository<Staff>,
    ) {}

    async validateStaff(username: string, password: string): Promise<any> {
        this.logger.debug(`Validating staff credentials for: ${username}`);

        // Find staff by username
        const staff = await this.staffRepository.findOne({
            where: { username, status: 'active' },
        });

        if (!staff) {
            this.logger.warn(
                `No active staff found with username: ${username}`,
            );
            throw new NotFoundException('Staff not found or inactive');
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, staff.password);
        if (!isPasswordValid) {
            this.logger.warn(`Invalid password for staff: ${username}`);
            throw new UnauthorizedException('Invalid credentials');
        }

        // Update last login timestamp
        await this.staffRepository.update(staff.id, {
            latestLogin: new Date(),
        });

        // Return staff without sensitive information
        const { password: _, ...result } = staff;
        return result;
    }

    async findStaffById(id: number): Promise<any> {
        const staff = await this.staffRepository.findOne({
            where: { id, status: 'active' },
        });

        if (!staff) {
            return null;
        }

        // Return without password
        const { password, ...result } = staff;
        return result;
    }

    async createStaff(staffData: {
        username: string;
        email: string;
        password: string;
        firstname: string;
        lastname: string;
        phoneNumber?: string;
    }): Promise<any> {
        try {
            // Check if username or email already exists
            const existingStaff = await this.staffRepository.findOne({
                where: [
                    { username: staffData.username },
                    { email: staffData.email },
                ],
            });

            if (existingStaff) {
                throw new ConflictException('Username or email already exists');
            }

            // Hash the password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(
                staffData.password,
                saltRounds,
            );

            // Create new staff - fix TypeScript error by creating entity properly
            const newStaff = this.staffRepository.create({
                firstname: staffData.firstname,
                lastname: staffData.lastname,
                email: staffData.email,
                username: staffData.username,
                password: hashedPassword,
                status: 'active',
                role: 'staff',
                phoneNumber: staffData.phoneNumber || null,
            });

            // Save to database
            const savedStaff = await this.staffRepository.save(newStaff);

            // Return staff data without password
            const { password, ...result } = savedStaff;
            return { success: true, staff: result };
        } catch (error) {
            if (error instanceof ConflictException) {
                throw error;
            }
            this.logger.error(
                `Failed to create staff: ${error.message}`,
                error.stack,
            );
            throw new InternalServerErrorException(
                'Failed to create staff account',
            );
        }
    }
}
