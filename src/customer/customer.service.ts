import {
    Injectable,
    ConflictException,
    NotFoundException,
    Logger,
    UnauthorizedException,
    InternalServerErrorException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Customer } from './customer.entity';
import { Role } from '../auth/enums/role.enum';

@Injectable()
export class CustomerService {
    private readonly logger = new Logger(CustomerService.name);

    constructor(
        @InjectRepository(Customer)
        private customerRepository: Repository<Customer>,
    ) {}

    async findByEmail(email: string): Promise<Customer> {
        try {
            let customer = await this.customerRepository.findOne({
                where: { email: email, status: 'active' },
            });

            if (!customer) {
                customer = await this.customerRepository
                    .createQueryBuilder('customer')
                    .where('LOWER(customer.email) = LOWER(:email)', { email })
                    .getOne();
            }
            if (!customer) {
                const rawResults = await this.customerRepository.query(
                    `SELECT id, email, username FROM "Customer" WHERE email = $1 OR LOWER(email) = LOWER($1)`,
                    [email],
                );

                if (rawResults && rawResults.length > 0) {
                    customer = await this.customerRepository.findOne({
                        where: { id: rawResults[0].id },
                    });
                }
            }

            if (!customer) {
                throw new NotFoundException('User not found');
            }
            return customer;
        } catch (error) {
            this.logger.error(
                `Database error looking up user by email: ${error.message}`,
            );
            throw error;
        }
    }

    async findByUsername(username: string): Promise<Customer | undefined> {
        try {
            let customer = await this.customerRepository.findOne({
                where: { username: username, status: 'active' },
            });

            if (!customer) {
                customer = await this.customerRepository
                    .createQueryBuilder('customer')
                    .where('LOWER(customer.username) = LOWER(:username)', {
                        username,
                    })
                    .getOne();
            }

            if (!customer) {
                const rawResults = await this.customerRepository.query(
                    `SELECT id, email, username FROM "Customer" WHERE username = $1 OR LOWER(username) = LOWER($1)`,
                    [username],
                );

                if (rawResults && rawResults.length > 0) {
                    customer = await this.customerRepository.findOne({
                        where: { id: rawResults[0].id },
                    });
                }
            }

            return customer;
        } catch (error) {
            this.logger.error(
                `Error finding user by username: ${error.message}`,
            );
            throw error;
        }
    }

    async findById(id: number): Promise<Customer | undefined> {
        return this.customerRepository.findOne({ where: { id } });
    }

    async findOne(id: number): Promise<Customer> {
        try {
            const customer = await this.customerRepository.findOne({
                where: { id },
            });
            if (!customer) {
                this.logger.warn(`User with ID ${id} not found in database`);
                return null;
            }
            return customer;
        } catch (error) {
            this.logger.error(
                `Error finding user with ID ${id}: ${error.message}`,
            );
            throw error;
        }
    }

    async create(data: {
        email: string;
        password?: string;
        username?: string;
        firstname?: string;
        lastname?: string;
        googleId?: string;
        avatar?: string;
        isEmailVerified?: boolean;
        status?: string;
    }): Promise<Customer> {
        const existingEmail = await this.findByEmail(data.email);

        if (existingEmail) {
            if (existingEmail.isEmailVerified) {
                throw new ConflictException('Email đã được sử dụng');
            } else {
                const otpCode = this.generateOTPCode();
                existingEmail.verificationToken = otpCode;

                if (data.password) {
                    existingEmail.password = await bcrypt.hash(data.password, 10);
                }
                if (data.username) existingEmail.username = data.username;
                if (data.firstname) existingEmail.firstname = data.firstname;
                if (data.lastname) existingEmail.lastname = data.lastname;
                if (data.googleId) existingEmail.googleId = data.googleId;
                if (data.avatar) existingEmail.avatar = data.avatar;
                if (data.isEmailVerified !== undefined)
                    existingEmail.isEmailVerified = data.isEmailVerified;
                if (data.status) existingEmail.status = data.status;

                existingEmail.updatedAt = new Date();
                await this.customerRepository.save(existingEmail);
                return existingEmail;
            }
        }

        if (data.username) {
            const existingUsername = await this.findByUsername(data.username);
            if (existingUsername) {
                throw new ConflictException('Username đã được sử dụng');
            }
        } else {
            data.username = data.email;
        }

        const hashedPassword = data.password
            ? await bcrypt.hash(data.password, 10)
            : null;
        const otpCode = this.generateOTPCode();

        const newCustomer = this.customerRepository.create({
            ...data,
            password: hashedPassword,
            verificationToken: otpCode,
            isEmailVerified: data.isEmailVerified ?? false,
            status: data.status ?? 'pending_verification',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await this.customerRepository.save(newCustomer);
        return newCustomer;
    }

    async verifyEmail(email: string, otpCode: string): Promise<Customer> {
        const customer = await this.findByEmail(email);
        if (!customer) {
            throw new NotFoundException('User not found');
        }

        if (customer.verificationToken !== otpCode) {
            throw new NotFoundException('Invalid OTP code');
        }

        customer.isEmailVerified = true;
        customer.status = 'active';
        customer.verificationToken = null;
        return this.customerRepository.save(customer);
    }

    async resendVerificationOTP(email: string): Promise<string> {
        const customer = await this.findByEmail(email);
        if (!customer) {
            throw new NotFoundException('User not found');
        }

        if (customer.isEmailVerified) {
            throw new ConflictException('Email already verified');
        }

        const otpCode = this.generateOTPCode();
        customer.verificationToken = otpCode;
        await this.customerRepository.save(customer);
        return otpCode;
    }

    async updateLoginTimestamp(id: number): Promise<void> {
        try {
            await this.customerRepository.update(
                { id },
                { latestLogin: new Date() },
            );
        } catch (error) {
            this.logger.error(
                `Failed to update login timestamp for user ${id}: ${error.message}`,
            );
            throw new InternalServerErrorException(
                'Failed to update login timestamp',
            );
        }
    }

    async createPasswordResetToken(email: string): Promise<string> {
        const customer = await this.findByEmail(email);
        
        if (!customer) {
            throw new NotFoundException('User not found');
        }

        if (customer.passwordResetToken && customer.passwordResetExpires && customer.passwordResetExpires > new Date()) {
            return customer.passwordResetToken;
        }

        const otpCode = this.generateOTPCode();

        customer.passwordResetToken = otpCode;
        customer.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
        customer.updatedAt = new Date();
        
        await this.customerRepository.save(customer);

        return otpCode;
    }

    async verifyResetOTP(email: string, otpCode: string): Promise<boolean> {
        const customer = await this.findByEmail(email);
        
        if (!customer) {
            throw new NotFoundException('User not found');
        }

        if (!customer.passwordResetToken) {
            throw new NotFoundException('Invalid reset request - no reset token');
        }

        if (customer.passwordResetExpires < new Date()) {
            throw new NotFoundException('OTP expired');
        }
        
        if (customer.passwordResetToken !== otpCode) {
            throw new NotFoundException('Invalid OTP code');
        }

        return true;
    }

    async resetPassword(
        email: string,
        otpCode: string,
        newPassword: string,
    ): Promise<void> {
        const customer = await this.findByEmail(email);
        
        if (!customer) {
            throw new NotFoundException('User not found');
        }

        if (!customer.passwordResetToken) {
            throw new NotFoundException('Invalid reset request - no reset token');
        }

        if (customer.passwordResetExpires < new Date()) {
            throw new NotFoundException('OTP expired');
        }

        if (customer.passwordResetToken !== otpCode) {
            throw new NotFoundException('Invalid OTP code');
        }

        const updatedCustomer = await this.customerRepository.save({
            ...customer,
            password: await bcrypt.hash(newPassword, 10),
            passwordResetToken: null,
            passwordResetExpires: null,
            updatedAt: new Date()
        });
        
        if (!updatedCustomer) {
            throw new Error("Failed to update password");
        }
    }

    async updateProfile(
        id: number,
        profileData: Partial<Customer>,
    ): Promise<Customer> {
        const safeData = { ...profileData };
        delete safeData.password;
        delete safeData.verificationToken;
        delete safeData.passwordResetToken;
        delete safeData.passwordResetExpires;
        delete safeData.status;

        safeData.updatedAt = new Date();
        await this.customerRepository.update(id, safeData);
        return this.findById(id);
    }

    async updatePassword(
        id: number,
        currentPassword: string,
        newPassword: string,
    ): Promise<void> {
        try {
            this.logger.log(`Attempting to update password for user ${id}`);
            
            const customer = await this.findById(id);
            if (!customer) {
                this.logger.warn(`User not found: ${id}`);
                throw new NotFoundException('User not found');
            }

            if (!customer.password) {
                this.logger.warn(`No password hash found for user ${id}`);
                throw new UnauthorizedException('Password not set for this account');
            }

            if (!currentPassword) {
                this.logger.warn(`Current password not provided for user ${id}`);
                throw new BadRequestException('Current password is required');
            }

            const isPasswordValid = await bcrypt.compare(
                currentPassword,
                customer.password,
            );
            if (!isPasswordValid) {
                this.logger.warn(`Invalid current password for user ${id}`);
                throw new UnauthorizedException('Current password is incorrect');
            }

            if (!newPassword) {
                this.logger.warn(`New password not provided for user ${id}`);
                throw new BadRequestException('New password is required');
            }

            customer.password = await bcrypt.hash(newPassword, 10);
            customer.updatedAt = new Date();
            await this.customerRepository.save(customer);
            
            this.logger.log(`Password updated successfully for user ${id}`);
        } catch (error) {
            this.logger.error(`Error updating password for user ${id}: ${error.message}`);
            throw error;
        }
    }

    private generateOTPCode(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async isValidForAuth(id: number): Promise<boolean> {
        try {
            const customer = await this.findOne(id);
            if (!customer) return false;
            return (
                customer.status === 'active' &&
                customer.isEmailVerified === true
            );
        } catch (error) {
            this.logger.error(`Error checking user validity: ${error.message}`);
            return false;
        }
    }

    async getAllCustomers(): Promise<
        { id: number; email: string; username: string }[]
    > {
        try {
            const customers = await this.customerRepository.find();
            return customers.map((customer) => ({
                id: customer.id,
                email: customer.email,
                username: customer.username,
            }));
        } catch (error) {
            this.logger.error(`Error listing all customers: ${error.message}`);
            return [];
        }
    }

    async findByLoginId(loginId: string): Promise<Customer | undefined> {
        let customer: Customer | undefined;
        
        try {
            customer = await this.findByEmail(loginId);
        } catch (error) {
            if (!(error instanceof NotFoundException)) {
                this.logger.error(`Error finding by email: ${error.message}`);
            }
        }

        if (!customer) {
            customer = await this.findByUsername(loginId);
        }

        if (!customer) {
            try {
                const result = await this.customerRepository.query(
                    `SELECT * FROM "Customer" WHERE email = $1 OR username = $1 LIMIT 1`,
                    [loginId],
                );
                if (result && result.length > 0) {
                    customer = await this.customerRepository.findOne({
                        where: { id: result[0].id },
                    });
                }
            } catch (error) {
                this.logger.error(`Error in direct query: ${error.message}`);
            }
        }
        return customer;
    }

    async validateCustomer(username: string, password: string): Promise<any> {
        const customer = await this.findByLoginId(username);
        if (!customer) {
            this.logger.warn(`Customer not found: ${username}`);
            throw new UnauthorizedException('Invalid credentials');
        }
        const isPasswordValid = await bcrypt.compare(
            password,
            customer.password,
        );
        if (!isPasswordValid) {
            this.logger.warn(`Invalid password for customer: ${username}`);
            throw new UnauthorizedException('Invalid credentials');
        }
        if (!customer.isEmailVerified) {
            this.logger.warn(`Unverified email for customer: ${username}`);
            throw new UnauthorizedException(
                'Please verify your email before logging in',
            );
        }
        if (customer.status !== 'active') {
            this.logger.warn(
                `Inactive customer: ${username}, status: ${customer.status}`,
            );
            throw new UnauthorizedException('Your account has been deactivated');
        }
        await this.updateLoginTimestamp(customer.id);
        const { password: _, ...result } = customer;
        return result;
    }

    async getSimpleCustomerList(
        search?: string,
        page: number = 1,
        limit: number = 10,
    ): Promise<{
        customers: { id: string; name: string }[];
        total: number;
        pages: number;
    }> {
        try {
            const queryBuilder = this.customerRepository
                .createQueryBuilder('customer')
                .select([
                    'customer.id',
                    'customer.firstname',
                    'customer.lastname',
                    'customer.email',
                ])
                .where('customer.status = :status', { status: 'active' });

            if (search && search.trim() !== '') {
                queryBuilder.andWhere(
                    '(LOWER(customer.firstname) LIKE LOWER(:search) OR ' +
                        'LOWER(customer.lastname) LIKE LOWER(:search) OR ' +
                        'LOWER(customer.email) LIKE LOWER(:search))',
                    { search: `%${search.trim()}%` },
                );
            }

            const total = await queryBuilder.getCount();

            const customers = await queryBuilder
                .orderBy('customer.lastname', 'ASC')
                .addOrderBy('customer.firstname', 'ASC')
                .skip((page - 1) * limit)
                .take(limit)
                .getMany();

            const pages = Math.ceil(total / limit);
            return {
                customers: customers.map((customer) => ({
                    id: customer.id.toString(),
                    name: `${customer.firstname} ${customer.lastname} (${customer.email})`,
                })),
                total,
                pages,
            };
        } catch (error) {
            this.logger.error(
                `Failed to get simple customer list: ${error.message}`,
            );
            throw new InternalServerErrorException(
                'Failed to retrieve customer list',
            );
        }
    }

    async updateStatus(id: number, status: string): Promise<Customer> {
        const customer = await this.findOne(id);
        if (!customer) {
            throw new NotFoundException(`Customer with ID ${id} not found`);
        }
        customer.status = status;
        return this.customerRepository.save(customer);
    }

    async findAllCustomers({
        page = 1,
        limit = 10,
        search = '',
        status = '',
        sortBy = 'createdAt',
        sortOrder = 'DESC',
    }: {
        page: number;
        limit: number;
        search?: string;
        status?: string;
        sortBy?: string;
        sortOrder?: 'ASC' | 'DESC';
    }) {
        try {
            let queryBuilder = this.customerRepository.createQueryBuilder('customer');

            if (status) {
                queryBuilder = queryBuilder.andWhere(
                    'customer.status = :status',
                    { status },
                );
            }
            if (search) {
                queryBuilder = queryBuilder.andWhere(
                    '(customer.email LIKE :search OR ' +
                        'customer.username LIKE :search OR ' +
                        'customer.firstname LIKE :search OR ' +
                        'customer.lastname LIKE :search OR ' +
                        'customer.phoneNumber LIKE :search)',
                    { search: `%${search}%` },
                );
            }

            const total = await queryBuilder.getCount();

            if (sortBy && sortOrder) {
                queryBuilder = queryBuilder.orderBy(
                    `customer.${sortBy}`,
                    sortOrder,
                );
            }
            const skip = (page - 1) * limit;
            queryBuilder = queryBuilder.skip(skip).take(limit);
            const customers = await queryBuilder.getMany();
            const pages = Math.ceil(total / limit);
            return {
                customers,
                total,
                pages,
            };
        } catch (error) {
            throw new Error(`Failed to fetch customers: ${error.message}`);
        }
    }

    async findByGoogleId(googleId: string): Promise<Customer> {
        return this.customerRepository.findOne({ where: { googleId } });
    }

    async update(id: number, data: Partial<Customer>): Promise<Customer> {
        await this.customerRepository.update(id, data);
        return this.customerRepository.findOne({ where: { id } });
    }

    async createGoogleUser(data: {
        email: string;
        firstname: string;
        lastname: string;
        googleId: string;
        avatar?: string;
        isEmailVerified?: boolean;
        status?: string;
    }): Promise<Customer> {
        const customer = this.customerRepository.create({
            ...data,
            role: Role.CUSTOMER,
        });
        return this.customerRepository.save(customer);
    }
}
