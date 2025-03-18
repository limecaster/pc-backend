import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

// Define interfaces for payment status responses
export interface PaymentStatusSuccessResponse {
    success: true;
    status: string;
    paymentData: any;
    orderUpdated?: boolean;
    orderId?: number;
}

export interface PaymentStatusErrorResponse {
    success: false;
    message: string;
    code?: string;
}

export type PaymentStatusResponse =
    | PaymentStatusSuccessResponse
    | PaymentStatusErrorResponse;

@Injectable()
export class PaymentService {
    private readonly logger = new Logger(PaymentService.name);
    private readonly payosApiUrl: string;
    private readonly clientId: string;
    private readonly apiKey: string;
    private readonly checksumKey: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.payosApiUrl = this.configService.get<string>(
            'PAYOS_API_URL',
            'https://api-merchant.payos.vn',
        );
        this.clientId = this.configService.get<string>('PAYOS_CLIENT_ID');
        this.apiKey = this.configService.get<string>('PAYOS_API_KEY');
        this.checksumKey = this.configService.get<string>('PAYOS_CHECKSUM_KEY');

        // Log the PayOS configuration on service initialization
        this.logger.log(`PayOS API URL: ${this.payosApiUrl}`);
        this.logger.log(
            `PayOS Client ID: ${this.clientId ? '******' : 'Missing'}`,
        );
        this.logger.log(`PayOS API Key: ${this.apiKey ? '******' : 'Missing'}`);
        this.logger.log(
            `PayOS Checksum Key: ${this.checksumKey ? '******' : 'Missing'}`,
        );
    }

    async createPaymentLink(order: any) {
        try {
            // Create a numeric orderCode using the current timestamp
            // This ensures it's a positive number within JavaScript's safe integer limits
            const orderCode = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

            // Format the request according to PayOS API requirements
            const paymentData = {
                orderCode, // Use numeric orderCode
                amount: order.total,
                description: 'Thanh toan B Store', // Use description if provided
                cancelUrl:
                    order.cancelUrl ||
                    `${this.configService.get<string>('FRONTEND_URL')}/checkout/failure`,
                returnUrl:
                    order.returnUrl ||
                    `${this.configService.get<string>('FRONTEND_URL')}/checkout/success`,
            };

            // Create signature according to PayOS requirements
            const signatureString = `amount=${paymentData.amount}&cancelUrl=${paymentData.cancelUrl}&description=${paymentData.description}&orderCode=${paymentData.orderCode}&returnUrl=${paymentData.returnUrl}`;

            this.logger.log('Signature string:', signatureString);

            const signature = this.createSignature(
                signatureString,
                this.checksumKey,
            );
            this.logger.log('Generated signature:', signature);

            // Add buyer information if available
            if (order.customer) {
                paymentData['buyerName'] = order.customer.fullName || '';
                paymentData['buyerEmail'] = order.customer.email || '';
                paymentData['buyerPhone'] = order.customer.phone || '';
                paymentData['buyerAddress'] = order.customer.address || '';
            }

            // Add items if available
            if (order.items && order.items.length > 0) {
                paymentData['items'] = order.items.map((item) => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                }));
            }

            // Final payload with signature
            const finalPayload = {
                ...paymentData,
                signature,
            };

            this.logger.log('Sending payment request to PayOS:', finalPayload);

            const response = await firstValueFrom(
                this.httpService.post(
                    `${this.payosApiUrl}/v2/payment-requests`,
                    finalPayload,
                    {
                        headers: {
                            'x-client-id': this.clientId,
                            'x-api-key': this.apiKey,
                            'Content-Type': 'application/json',
                        },
                    },
                ),
            );

            this.logger.log('PayOS response status:', response.status);
            this.logger.log('PayOS response data:', response.data);

            // Store the original order ID together with the numeric order code
            // to be able to associate them later
            if (response.data && response.data.code === '00') {
                // Add original order ID to response data for reference
                response.data.originalOrderId =
                    order.orderId || `ORDER-${orderCode}`;
            }

            return response.data;
        } catch (error) {
            this.logger.error('Error creating payment link:', error);

            // Log additional details about the error
            if (error.response) {
                this.logger.error(
                    `Error response status: ${error.response.status}`,
                );
                this.logger.error('Error response data:', error.response.data);
            }

            throw error;
        }
    }

    // Create signature for request validation with exact PayOS format
    private createSignature(data: string, secretKey: string): string {
        return crypto
            .createHmac('sha256', secretKey)
            .update(data)
            .digest('hex');
    }

    // Verify webhook signature
    verifyPaymentWebhook(payload: any, signature: string): boolean {
        try {
            // Convert the webhook payload to the format required by PayOS for verification
            const data = payload.data || payload;

            const signatureString = `amount=${data.amount}&description=${data.description}&orderCode=${data.orderCode}&status=${data.status}`;

            const expectedSignature = this.createSignature(
                signatureString,
                this.checksumKey,
            );

            return expectedSignature === signature;
        } catch (error) {
            this.logger.error('Error verifying webhook signature:', error);
            return false;
        }
    }

    // Check payment status
    async checkPaymentStatus(
        paymentId: string,
    ): Promise<PaymentStatusResponse> {
        try {
            this.logger.log(
                `Checking payment status for payment ID: ${paymentId}`,
            );

            const response = await firstValueFrom(
                this.httpService.get(
                    `${this.payosApiUrl}/v2/payment-requests/${paymentId}`,
                    {
                        headers: {
                            'x-client-id': this.clientId,
                            'x-api-key': this.apiKey,
                        },
                    },
                ),
            );

            this.logger.log(`Payment status response: ${response.status}`);

            if (response.data && response.data.code === '00') {
                return {
                    success: true,
                    status: response.data.data.status,
                    paymentData: response.data.data,
                };
            } else {
                return {
                    success: false,
                    message:
                        response.data?.desc || 'Failed to check payment status',
                    code: response.data?.code,
                };
            }
        } catch (error) {
            this.logger.error(`Error checking payment status: ${error}`);
            if (error.response) {
                this.logger.error('Error response data:', error.response.data);
            }

            throw new Error('Failed to check payment status');
        }
    }
}
