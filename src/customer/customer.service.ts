import {
    Injectable,
    ConflictException,
    NotFoundException,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Customer } from './customer.entity';

@Injectable()
export class CustomerService {
    private readonly logger = new Logger(CustomerService.name);

    constructor(
        @InjectRepository(Customer)
        private customerRepository: Repository<Customer>,
    ) {}

    async findByEmail(email: string): Promise<Customer | undefined> {
        this.logger.debug(`Looking up user by email: ${email}`);
        try {
            // First try with exact match
            let customer = await this.customerRepository.findOne({ where: { email } });
            
            // If not found, try case-insensitive lookup
            if (!customer) {
                this.logger.debug(`No exact match for email: ${email}, trying case-insensitive query`);
                
                // Using query builder for case-insensitive search
                customer = await this.customerRepository
                    .createQueryBuilder('customer')
                    .where('LOWER(customer.email) = LOWER(:email)', { email })
                    .getOne();
                
                if (customer) {
                    this.logger.debug(`Found user with case-insensitive email match: ${customer.email} (ID: ${customer.id})`);
                }
            }
            
            // Last resort: Direct SQL query to see what's happening
            if (!customer) {
                this.logger.debug(`Still no match, executing raw SQL query`);
                
                const rawResults = await this.customerRepository.query(
                    `SELECT id, email, username FROM "Customer" WHERE email = $1 OR LOWER(email) = LOWER($1)`,
                    [email]
                );
                
                this.logger.debug(`Raw SQL results: ${JSON.stringify(rawResults)}`);
                
                // If we found results in raw SQL but not through TypeORM, there's a mapping issue
                if (rawResults && rawResults.length > 0) {
                    // Try to load the full entity based on the ID we found
                    customer = await this.customerRepository.findOne({ 
                        where: { id: rawResults[0].id } 
                    });
                    
                    if (customer) {
                        this.logger.debug(`Found through raw SQL: ${customer.id}`);
                    }
                }
            }
            
            if (customer) {
                this.logger.debug(`Found user with ID ${customer.id} by email: ${email}`);
            } else {
                this.logger.debug(`No user found with email: ${email}`);
                // List all emails in the database for debugging
                const allEmails = await this.customerRepository
                    .createQueryBuilder('customer')
                    .select(['customer.id', 'customer.email'])
                    .getMany();
                    
                this.logger.debug(`All emails in database: ${JSON.stringify(allEmails.map(c => c.email))}`);
            }
            
            return customer;
        } catch (error) {
            this.logger.error(`Database error looking up user by email: ${error.message}`);
            throw error;
        }
    }

    async findByUsername(username: string): Promise<Customer | undefined> {
        this.logger.debug(`Looking up user by username: ${username}`);
        try {
            // Try exact match first
            let customer = await this.customerRepository.findOne({ where: { username } });
            
            // Try case-insensitive lookup
            if (!customer) {
                this.logger.debug(`No exact match for username: ${username}, trying case-insensitive query`);
                
                customer = await this.customerRepository
                    .createQueryBuilder('customer')
                    .where('LOWER(customer.username) = LOWER(:username)', { username })
                    .getOne();
                
                if (customer) {
                    this.logger.debug(`Found user with case-insensitive username match: ${customer.username}`);
                }
            }
            
            // Raw SQL fallback
            if (!customer) {
                const rawResults = await this.customerRepository.query(
                    `SELECT id, email, username FROM "Customer" WHERE username = $1 OR LOWER(username) = LOWER($1)`,
                    [username]
                );
                
                this.logger.debug(`Raw username SQL results: ${JSON.stringify(rawResults)}`);
                
                if (rawResults && rawResults.length > 0) {
                    customer = await this.customerRepository.findOne({ 
                        where: { id: rawResults[0].id } 
                    });
                }
            }
            
            if (!customer) {
                this.logger.debug(`No user found with username: ${username}`);
            }
            
            return customer;
        } catch (error) {
            this.logger.error(`Error finding user by username: ${error.message}`);
            throw error;
        }
    }

    async findById(id: number): Promise<Customer | undefined> {
        return this.customerRepository.findOne({ where: { id } });
    }

    async findOne(id: number): Promise<Customer> {
        try {
            const customer = await this.customerRepository.findOne({ where: { id } });
            if (!customer) {
                this.logger.warn(`User with ID ${id} not found in database`);
                return null;
            }
            return customer;
        } catch (error) {
            this.logger.error(`Error finding user with ID ${id}: ${error.message}`);
            throw error;
        }
    }

    async create(userData: {
        email: string;
        password: string;
        username?: string;
        firstname?: string;
        lastname?: string;
    }): Promise<Customer> {
        // Check for existing email
        const existingEmail = await this.findByEmail(userData.email);
        if (existingEmail) {
            throw new ConflictException('Email đã được sử dụng');
        }

        // Check for existing username if provided
        if (userData.username) {
            const existingUsername = await this.findByUsername(
                userData.username,
            );
            if (existingUsername) {
                throw new ConflictException('Username đã được sử dụng');
            }
        } else {
            // Use email as username if not provided
            userData.username = userData.email;
        }

        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const otpCode = this.generateOTPCode(); // Generate OTP instead of verification token

        const newCustomer = this.customerRepository.create({
            ...userData,
            password: hashedPassword,
            verificationToken: otpCode,
            isEmailVerified: false,
            status: 'pending_verification',
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

        // Only allow resend if not yet verified
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
            this.logger.error(`Failed to update login timestamp for user ${id}: ${error.message}`);
            // Don't throw here, just log the error
        }
    }

    async createPasswordResetToken(email: string): Promise<string> {
        const customer = await this.findByEmail(email);
        if (!customer) {
            throw new NotFoundException('User not found');
        }

        const otpCode = this.generateOTPCode(); // Use OTP instead of token
        customer.passwordResetToken = otpCode;
        customer.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        customer.updatedAt = new Date();
        await this.customerRepository.save(customer);

        return otpCode;
    }

    async verifyResetOTP(email: string, otpCode: string): Promise<boolean> {
        const customer = await this.findByEmail(email);
        if (!customer || !customer.passwordResetToken) {
            throw new NotFoundException('Invalid reset request');
        }

        if (customer.passwordResetExpires < new Date()) {
            throw new NotFoundException('OTP expired');
        }

        // Direct OTP comparison instead of bcrypt
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
        // Verify OTP first
        await this.verifyResetOTP(email, otpCode);

        const customer = await this.findByEmail(email);
        customer.password = await bcrypt.hash(newPassword, 10);
        customer.passwordResetToken = null;
        customer.passwordResetExpires = null;
        customer.updatedAt = new Date();
        await this.customerRepository.save(customer);
    }

    async updateProfile(
        id: number,
        profileData: Partial<Customer>,
    ): Promise<Customer> {
        // Prevent updates to sensitive fields
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
        const customer = await this.findById(id);
        if (!customer) {
            throw new NotFoundException('User not found');
        }

        const isPasswordValid = await bcrypt.compare(
            currentPassword,
            customer.password,
        );
        if (!isPasswordValid) {
            throw new ConflictException('Current password is incorrect');
        }

        customer.password = await bcrypt.hash(newPassword, 10);
        customer.updatedAt = new Date();
        await this.customerRepository.save(customer);
    }

    private generateVerificationToken(): string {
        return (
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15)
        );
    }

    // Helper method to generate a 6-digit OTP code
    private generateOTPCode(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Add a method to verify if a user is valid for authentication
    async isValidForAuth(id: number): Promise<boolean> {
        try {
            const customer = await this.findOne(id);
            if (!customer) return false;
            
            // Check if user is active and email verified
            return customer.status === 'active' && customer.isEmailVerified === true;
        } catch (error) {
            this.logger.error(`Error checking user validity: ${error.message}`);
            return false;
        }
    }

    // For debugging purposes - list all users
    async getAllCustomers(): Promise<{id: number, email: string, username: string}[]> {
        try {
            const customers = await this.customerRepository.find();
            return customers.map(customer => ({
                id: customer.id,
                email: customer.email,
                username: customer.username
            }));
        } catch (error) {
            this.logger.error(`Error listing all customers: ${error.message}`);
            return [];
        }
    }

    // Add a flexible lookup method that tries both email and username
    async findByLoginId(loginId: string): Promise<Customer | undefined> {
        this.logger.debug(`Flexible lookup by loginId: ${loginId}`);
        
        // Try email first
        let customer = await this.findByEmail(loginId);
        console.log("Found by email: ", customer);
        // If not found by email, try username
        if (!customer) {
            customer = await this.findByUsername(loginId);
        }
        console.log("Found by username: ", customer);
        // If still not found, try direct query
        if (!customer) {
            try {
                this.logger.debug(`Attempting direct query for loginId: ${loginId}`);
                
                // Query that checks both email and username fields
                const result = await this.customerRepository.query(
                    `SELECT * FROM "Customer" WHERE email = $1 OR username = $1 LIMIT 1`,
                    [loginId]
                );
                
                if (result && result.length > 0) {
                    this.logger.debug(`Found user directly: ${result[0].id}`);
                    customer = await this.customerRepository.findOne({ where: { id: result[0].id } });
                }
            } catch (error) {
                this.logger.error(`Error in direct query: ${error.message}`);
            }
        }
        
        return customer;
    }
}
