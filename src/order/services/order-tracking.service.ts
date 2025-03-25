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
            this.logger.error(`Order with identifier ${orderId} not found`);
            throw new NotFoundException(
                `Order with identifier ${orderId} not found`,
            );
        }

        // Verify that this email is associated with the order
        let isValidEmail = false;

        if (order.customer?.email?.toLowerCase() === email.toLowerCase()) {
            isValidEmail = true;
        } else if (order.guestEmail?.toLowerCase() === email.toLowerCase()) {
            isValidEmail = true;
        }

        if (!isValidEmail) {
            this.logger.error(
                `Unauthorized access attempt for order ${orderId} with email ${email}`,
            );
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
            this.logger.error(`Order ${orderId} not found during OTP verification`);
            return false;
        }

        // Use order.id to ensure the key matches what was used in generateTrackingOTP
        const otpKey = `${order.id}-${email}`;

        const storedData = this.otpStore.get(otpKey);

        if (!storedData) {
            this.logger.error(`No OTP found for key ${otpKey}`);
            return false;
        }

        // Check if OTP has expired
        if (storedData.expires < new Date()) {
            this.logger.error(`OTP for order ${orderId} has expired`);
            this.otpStore.delete(otpKey);
            return false;
        }

        // Check if OTP matches
        const isValid = storedData.otp === otp;

        // OTP is valid, delete it after use
        if (isValid) {
            this.otpStore.delete(otpKey);
        } else {
            this.logger.error(
                `Invalid OTP for order ${orderId}. Expected: ${storedData.otp}, Got: ${otp}`,
            );
        }

        return isValid;
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
            this.logger.error(`Order ${orderId} not found during permission check`);
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
        try {
            const order = await this.orderRepository.findOne({
                where: { id: orderId },
                relations: ['customer'],
            });

            if (!order) {
                this.logger.error(`Order ${orderId} not found during access verification`);
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
