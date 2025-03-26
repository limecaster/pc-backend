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
     * @param identifier The order number or ID
     * @param email Email to send the OTP to
     * @returns The generated OTP
     */
    async generateTrackingOTP(
        identifier: string | number,
        email: string,
    ): Promise<string> {
        // Find the order first
        const order = await this.findOrderByIdentifier(identifier);

        if (!order) {
            this.logger.error(`Order with identifier ${identifier} not found`);
            throw new NotFoundException(
                `Không tìm thấy đơn hàng với mã ${identifier}`,
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
                `Unauthorized access attempt for order ${order.orderNumber} with email ${email}`,
            );
            throw new UnauthorizedException(
                'Email không trùng khớp với đơn hàng này',
            );
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Store OTP with a 15-minute expiry
        const expiry = new Date();
        expiry.setMinutes(expiry.getMinutes() + 15);

        // Use consistent key based on orderNumber and email
        const otpKey = `${order.orderNumber}-${email}`;

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
     * @param identifier The order number or ID
     * @param email Email associated with the order
     * @param otp OTP to verify
     * @returns True if OTP is valid, false otherwise
     */
    async verifyTrackingOTP(
        identifier: string | number,
        email: string,
        otp: string,
    ): Promise<boolean> {
        // First, find the order to get the consistent order number
        const order = await this.findOrderByIdentifier(identifier);

        if (!order) {
            this.logger.error(`Order ${identifier} not found during OTP verification`);
            return false;
        }

        // Use order.orderNumber as the key
        const otpKey = `${order.orderNumber}-${email}`;

        const storedData = this.otpStore.get(otpKey);

        if (!storedData) {
            this.logger.error(`No OTP found for key ${otpKey}`);
            return false;
        }

        // Check if OTP has expired
        if (storedData.expires < new Date()) {
            this.logger.error(`OTP for order ${order.orderNumber} has expired`);
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
                `Invalid OTP for order ${order.orderNumber}. Expected: ${storedData.otp}, Got: ${otp}`,
            );
        }

        return isValid;
    }

    /**
     * Helper method to find an order by either ID or order number
     */
    private async findOrderByIdentifier(identifier: string | number): Promise<Order | null> {
        let order: Order = null;
        
        // First try to find by order number (string identifier)
        if (typeof identifier === 'string') {
            order = await this.orderRepository.findOne({
                where: { orderNumber: identifier },
                relations: ['customer'],
            });
        }
        
        // If not found and the identifier could be numeric, try as ID
        if (!order && (typeof identifier === 'number' || !isNaN(Number(identifier)))) {
            order = await this.orderRepository.findOne({
                where: { id: typeof identifier === 'number' ? identifier : Number(identifier) },
                relations: ['customer'],
            });
        }
        
        return order;
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
     * @param identifier Order number or ID to track
     * @param userId User ID (if authenticated)
     * @returns True if user has permission, false otherwise
     */
    async checkOrderTrackingPermission(
        identifier: string | number,
        userId?: number,
    ): Promise<boolean> {
        const order = await this.findOrderByIdentifier(identifier);

        if (!order) {
            this.logger.error(`Order ${identifier} not found during permission check`);
            return false;
        }

        // If no user ID provided, permission denied
        if (!userId) {
            return false;
        }
        
        // Check if the authenticated user owns the order
        if (order.customer && order.customer.id === userId) {
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
