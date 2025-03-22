import {
    Injectable,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../order.entity';

@Injectable()
export class OrderTrackingService {
    private readonly logger = new Logger(OrderTrackingService.name);
    // Store OTPs with expiry times
    private otpStore: Map<string, { otp: string; expires: Date }> = new Map();

    constructor(
        @InjectRepository(Order)
        private orderRepository: Repository<Order>,
    ) {}

    /**
     * Generate a tracking OTP for an order
     * @param orderId The order ID or order number
     * @param email Email to send the OTP to
     * @returns The generated OTP
     */
    async generateTrackingOTP(
        orderId: string | number,
        email: string,
    ): Promise<string> {
        // Verify the order exists
        let order;
        const isNumeric = !isNaN(Number(orderId));
        if (isNumeric) {
            order = await this.orderRepository.findOne({
                where: { id: Number(orderId) },
                relations: ['customer'],
            });
        } else {
            order = await this.orderRepository.findOne({
                where: { orderNumber: orderId as string },
                relations: ['customer'],
            });
        }

        if (!order) {
            throw new NotFoundException(
                `Order with identifier ${orderId} not found`,
            );
        }

        // Verify that this email is associated with the order
        // either as the customer email or the email provided during guest checkout
        let isValidEmail = false;

        if (order.customer?.email?.toLowerCase() === email.toLowerCase()) {
            isValidEmail = true;
        } else if (order.guestEmail?.toLowerCase() === email.toLowerCase()) {
            isValidEmail = true;
        }

        if (!isValidEmail) {
            throw new UnauthorizedException(
                'Email is not associated with this order',
            );
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Store OTP with a 15-minute expiry
        const expiry = new Date();
        expiry.setMinutes(expiry.getMinutes() + 15);

        // Use order ID for consistent key (in case orderNumber was provided)
        const otpKey = `${order.id}-${email}`;
        
        // Store the OTP
        this.otpStore.set(otpKey, {
            otp,
            expires: expiry,
        });
        
        this.logger.log(`Generated OTP for order ${order.id} (${orderId}), email: ${email}, key: ${otpKey}, OTP: ${otp}`);
        
        // Log the current state of the OTP store for debugging
        this.logOtpStoreStatus();

        // Clean up expired OTPs occasionally
        this.cleanupExpiredOTPs();

        return otp;
    }

    /**
     * Verify a tracking OTP for an order
     * @param orderId The order ID or order number
     * @param email Email associated with the order
     * @param otp OTP to verify
     * @returns True if OTP is valid, false otherwise
     */
    async verifyTrackingOTP(
        orderId: string | number,
        email: string,
        otp: string,
    ): Promise<boolean> {
        this.logger.log(`Verifying OTP for order ${orderId} and email ${email}, OTP: ${otp}`);
        
        // Log the current state of the OTP store
        this.logOtpStoreStatus();
        
        // First, find the order to get the consistent ID
        let order;
        
        // Handle both numeric IDs and order numbers
        if (typeof orderId === 'number' || !isNaN(Number(orderId))) {
            order = await this.orderRepository.findOne({
                where: { id: typeof orderId === 'number' ? orderId : Number(orderId) },
            });
        } else {
            order = await this.orderRepository.findOne({
                where: { orderNumber: orderId as string },
            });
        }

        if (!order) {
            this.logger.warn(`Order ${orderId} not found during OTP verification`);
            return false;
        }

        // Use order.id to ensure the key matches what was used in generateTrackingOTP
        const otpKey = `${order.id}-${email}`;
        this.logger.log(`Looking up OTP with key: ${otpKey}`);
        
        const storedData = this.otpStore.get(otpKey);

        if (!storedData) {
            this.logger.warn(`No OTP found for key ${otpKey}`);
            return false;
        }

        // Check if OTP has expired
        if (storedData.expires < new Date()) {
            this.logger.warn(`OTP for order ${orderId} has expired`);
            this.otpStore.delete(otpKey);
            return false;
        }

        // Check if OTP matches
        const isValid = storedData.otp === otp;
        this.logger.log(`OTP validation result for order ${orderId}: ${isValid ? 'valid' : 'invalid'}, Expected: ${storedData.otp}, Got: ${otp}`);

        // OTP is valid, delete it after use
        if (isValid) {
            this.otpStore.delete(otpKey);
        }
        
        return isValid;
    }

    /**
     * Log the current state of the OTP store for debugging
     */
    private logOtpStoreStatus(): void {
        this.logger.log(`Current OTP store size: ${this.otpStore.size}`);
        if (this.otpStore.size > 0) {
            this.logger.log('OTP store contents:');
            for (const [key, value] of this.otpStore.entries()) {
                const expiresIn = Math.round((value.expires.getTime() - Date.now()) / 1000);
                this.logger.log(`- Key: ${key}, OTP: ${value.otp}, Expires in: ${expiresIn}s`);
            }
        }
    }

    /**
     * Clean up expired OTPs
     */
    private cleanupExpiredOTPs(): void {
        const now = new Date();
        for (const [key, value] of this.otpStore.entries()) {
            if (value.expires < now) {
                this.otpStore.delete(key);
            }
        }
    }

    /**
     * Check if a user has permission to track an order
     * @param orderId Order ID to track
     * @param userId User ID (if authenticated)
     * @returns True if user has permission, false otherwise
     */
    async checkOrderTrackingPermission(
        orderId: number,
        userId?: number,
    ): Promise<boolean> {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: ['customer'],
        });

        if (!order) {
            return false;
        }

        // If user is authenticated, check if they own the order
        if (userId && order.customer && order.customer.id === userId) {
            return true;
        }

        // For guests or users not owning the order, verification will be needed
        return false;
    }

    /**
     * Verify a user's access to an order using provided verification data
     */
    async verifyOrderAccess(
        orderId: number,
        verificationData: string,
    ): Promise<boolean> {
        this.logger.log(`Verifying access to order ${orderId}`);

        try {
            const order = await this.orderRepository.findOne({
                where: { id: orderId },
                relations: ['customer'],
            });

            if (!order) {
                return false;
            }

            // Verify using various possible fields - email, phone number, last 4 digits of CC
            const possibleMatches = [
                order.customer?.email?.toLowerCase(),
                order.customer?.phoneNumber?.toLowerCase(),
                order.customerPhone?.toLowerCase(),
                // Add more fields as needed
            ].filter(Boolean); // Filter out undefined/null values

            const normalizedInput = verificationData.toLowerCase().trim();

            return possibleMatches.some((match) => match === normalizedInput);
        } catch (error) {
            this.logger.error(`Error verifying order access: ${error.message}`);
            return false;
        }
    }
}
