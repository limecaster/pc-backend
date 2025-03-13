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

    async findAll(page = 1, limit = 10): Promise<{ staff: Staff[], total: number, pages: number }> {
        const [staff, total] = await this.staffRepository.findAndCount({
            select: ['id', 'firstname', 'lastname', 'email', 'phoneNumber', 'role', 'status', 'createdAt', 'updatedAt'],
            skip: (page - 1) * limit,
            take: limit,
            order: { createdAt: 'DESC' }
        });

        return {
            staff,
            total,
            pages: Math.ceil(total / limit)
        };
    }

    async findStaffById(id: number): Promise<Staff> {
        const staff = await this.staffRepository.findOne({
            where: { id },
            select: ['id', 'firstname', 'lastname', 'email', 'phoneNumber', 'role', 'status', 'street', 'ward', 'district', 'city', 'createdAt', 'updatedAt']
        });

        if (!staff) {
            throw new NotFoundException(`Staff with ID ${id} not found`);
        }

        return staff;
    }

    async createStaff(staffData: {
        username: string;
        email: string;
        password: string;
        firstname: string;
        lastname: string;
        phoneNumber?: string;
        role?: string;
    }): Promise<{ staff: Staff }> {
        // Check if email or username already exists
        const existingStaff = await this.staffRepository.findOne({
            where: [
                { email: staffData.email },
                { username: staffData.username }
            ]
        });

        if (existingStaff) {
            throw new ConflictException('Email or username already exists');
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(staffData.password, 10);

        // Create new staff member
        const newStaff = this.staffRepository.create({
            ...staffData,
            password: hashedPassword,
            role: staffData.role || 'staff',
            status: 'active',
        });

        const savedStaff = await this.staffRepository.save(newStaff);
        
        // Remove password from returned object
        const { password, ...staffWithoutPassword } = savedStaff;
        
        return { staff: staffWithoutPassword as Staff };
    }

    async updateStaff(id: number, staffData: {
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
    }): Promise<Staff> {
        const staff = await this.staffRepository.findOne({ where: { id } });
        
        if (!staff) {
            throw new NotFoundException(`Staff with ID ${id} not found`);
        }

        // If updating email, check for duplicates
        if (staffData.email && staffData.email !== staff.email) {
            const existingStaff = await this.staffRepository.findOne({ 
                where: { email: staffData.email } 
            });
            
            if (existingStaff) {
                throw new ConflictException('Email already exists');
            }
        }

        // If password is provided, hash it
        if (staffData.password) {
            staffData.password = await bcrypt.hash(staffData.password, 10);
        }

        // Update staff data
        Object.assign(staff, staffData);
        
        const updatedStaff = await this.staffRepository.save(staff);
        
        // Remove password from returned object
        const { password, ...staffWithoutPassword } = updatedStaff;
        
        return staffWithoutPassword as Staff;
    }

    async deleteStaff(id: number): Promise<void> {
        const staff = await this.staffRepository.findOne({ where: { id } });
        
        if (!staff) {
            throw new NotFoundException(`Staff with ID ${id} not found`);
        }
        
        await this.staffRepository.remove(staff);
    }

    async deactivateStaff(id: number): Promise<Staff> {
        const staff = await this.staffRepository.findOne({ where: { id } });
        
        if (!staff) {
            throw new NotFoundException(`Staff with ID ${id} not found`);
        }
        
        staff.status = 'inactive';
        
        const updatedStaff = await this.staffRepository.save(staff);
        
        // Remove password from returned object
        const { password, ...staffWithoutPassword } = updatedStaff;
        
        return staffWithoutPassword as Staff;
    }

    async activateStaff(id: number): Promise<Staff> {
        const staff = await this.staffRepository.findOne({ where: { id } });
        
        if (!staff) {
            throw new NotFoundException(`Staff with ID ${id} not found`);
        }
        
        staff.status = 'active';
        
        const updatedStaff = await this.staffRepository.save(staff);
        
        // Remove password from returned object
        const { password, ...staffWithoutPassword } = updatedStaff;
        
        return staffWithoutPassword as Staff;
    }
}
