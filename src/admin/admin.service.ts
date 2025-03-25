import {
    Injectable,
    Logger,
    ConflictException,
    InternalServerErrorException,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from './admin.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        @InjectRepository(Admin)
        private adminRepository: Repository<Admin>,
    ) {}

    async findAdminById(id: number): Promise<any> {
        const admin = await this.adminRepository.findOne({
            where: { id },
        });

        if (!admin) {
            return null;
        }

        // Return without password
        const { password, ...result } = admin;
        return result;
    }

    async createAdmin(adminData: {
        username: string;
        email: string;
        password: string;
        firstname: string;
        lastname: string;
        phoneNumber?: string;
    }): Promise<any> {
        try {
            // Check if username or email already exists
            const existingAdmin = await this.adminRepository.findOne({
                where: [
                    { username: adminData.username },
                    { email: adminData.email },
                ],
            });

            if (existingAdmin) {
                throw new ConflictException('Username or email already exists');
            }

            // Hash the password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(
                adminData.password,
                saltRounds,
            );

            // Create new admin - fix TypeScript error by creating entity properly
            const newAdmin = this.adminRepository.create({
                firstname: adminData.firstname,
                lastname: adminData.lastname,
                email: adminData.email,
                username: adminData.username,
                password: hashedPassword,
                status: 'active',
                phoneNumber: adminData.phoneNumber || null,
            });

            // Save to database
            const savedAdmin = await this.adminRepository.save(newAdmin);

            // Return admin data without password
            const { password, ...result } = savedAdmin;
            return { success: true, admin: result };
        } catch (error) {
            if (error instanceof ConflictException) {
                throw error;
            }
            this.logger.error(
                `Failed to create admin: ${error.message}`,
                error.stack,
            );
            throw new InternalServerErrorException(
                'Failed to create admin account',
            );
        }
    }

    async validateAdmin(username: string, password: string): Promise<any> {
        try {
            // Find admin by username
            const admin = await this.adminRepository.findOne({
                where: { username, status: 'active' },
            });

            if (!admin) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(
                password,
                admin.password,
            );
            if (!isPasswordValid) {
                throw new UnauthorizedException('Invalid credentials');
            }

            // Update last login timestamp
            await this.adminRepository.update(admin.id, {
                latestLogin: new Date(),
            });

            // Return admin without sensitive information
            const { password: _, ...result } = admin;

            // Add the ID field explicitly - make sure we have the right property name
            return {
                id: admin.id,
                ...result,
            };
        } catch (error) {
            this.logger.error(
                `Error validating admin ${username}: ${error.message}`,
            );
            throw error;
        }
    }

    async getAdminCount(): Promise<number> {
        return this.adminRepository.count();
    }

    /**
     * Find an admin by username
     * @param username The username to search for
     * @returns The admin user or null if not found
     */
    async findByUsername(username: string) {
        try {
            return await this.adminRepository.findOne({
                where: { username },
            });
        } catch (error) {
            this.logger.error(
                `Error finding admin by username ${username}: ${error.message}`,
            );
            throw error;
        }
    }
}
