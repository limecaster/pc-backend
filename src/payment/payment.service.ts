import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { Order } from 'src/order/order.entity';

@Injectable()
export class PaymentService {
    private readonly logger = new Logger(PaymentService.name);
    private readonly clientId: string;
    private readonly apiKey: string;
    private readonly checksum: string;
    private readonly apiUrl: string;

    constructor(private configService: ConfigService) {
        this.clientId = this.configService.get<string>('PAYOS_CLIENT_ID');
        this.apiKey = this.configService.get<string>('PAYOS_API_KEY');
        this.checksum = this.configService.get<string>('PAYOS_CHECKSUM_KEY');
        this.apiUrl = this.configService.get<string>(
            'PAYOS_API_URL',
            'https://api-merchant.payos.vn',
        );

        if (!this.clientId || !this.apiKey || !this.checksum) {
            this.logger.warn(
                'PayOS configuration is incomplete. Please check your environment variables.',
            );
        }
    }

    async createPaymentLink(paymentData: any) {
        try {
            // Use numeric order ID for PayOS orderCode
            const orderCode = paymentData.orderId; // Ensure this is a number and within safe range
            // Format price and amount values as numbers (NOT strings)
            const formattedAmount = this.formatCurrencyForPayOS(
                paymentData.total,
            );
            const numericAmount = Number(formattedAmount);
            if (numericAmount <= 0) {
                throw new Error('Giá trị thanh toán phải lớn hơn 0');
            }
            if (numericAmount >= 10000000000) {
                throw new Error('Giá trị thanh toán phải nhỏ hơn 10,000,000,000 VND');
            }

            // Format items with constraint validation - using numeric values

            const formattedItems = paymentData.items.map((item) => {
                const price = Number(this.formatCurrencyForPayOS(item.price));
                if (price <= 0) {
                    throw new Error(
                        `Giá trị thanh toán cho "${item.name}" phải lớn hơn 0`,
                    );
                }
                if (price >= 10000000000) {
                    throw new Error(
                        `Giá trị thanh toán cho "${item.name}" phải nhỏ hơn 10,000,000,000 VND`,
                    );
                }
                return {
                    name: item.name.substring(0, 50),
                    quantity: item.quantity,
                    price: price,
                };
            });

            // Limit description to 25 characters as per API requirement
            const description = (
                'B Store'
            ).substring(0, 25);

            const config = this.configService.get('FRONTEND_URL');

            // Prepare payment request
            const paymentRequest = {
                orderCode: orderCode, // Now numeric
                amount: numericAmount,
                description,
                cancelUrl: `${config}/checkout/cancel`,
                returnUrl: `${config}/checkout/success`,
                buyerName: (paymentData.customerName || '').substring(
                    0,
                    50,
                ),
                buyerEmail: (paymentData.customer.email || '').substring(
                    0,
                    50,
                ),
                buyerPhone: (paymentData.customerPhone || '').substring(
                    0,
                    20,
                ),
                buyerAddress: (paymentData.deliveryAddress || '').substring(
                    0,
                    100,
                ),
                items: formattedItems,
            };

            const signatureString = this.buildSignatureString(paymentRequest);
            const signature = this.generateSignature(signatureString);

            const finalRequest = {
                ...paymentRequest,
                signature: signature,
            };

            // Send request to PayOS API
            const response = await axios.post(
                `${this.apiUrl}/v2/payment-requests`,
                finalRequest,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-client-id': this.clientId,
                        'x-api-key': this.apiKey,
                    },
                },
            );

            if (response.data && response.data.code === '00') {
                return {
                    success: true,
                    data: {
                        checkoutUrl: response.data.data?.checkoutUrl,
                        qrCode: response.data.data?.qrCode,
                        orderId: orderCode,
                        paymentLinkId: response.data.data?.paymentLinkId,
                    },
                };
            } else {
                return {
                    success: false,
                    message:
                        response.data?.desc || 'Failed to create payment link',
                    data: response.data,
                };
            }
        } catch (error) {
            if (error.response?.data?.desc) {
                this.logger.error(`PayOS error: ${error.response.data.desc}`);
                return {
                    success: false,
                    message: `PayOS error: ${error.response.data.desc}`,
                    error: error.response.data,
                };
            }
            this.logger.error('Error creating payment link:', error);
            return {
                success: false,
                message:
                    error.message ||
                    'An error occurred during payment processing',
                error: error.response?.data || error.message,
            };
        }
    }

    /**
     * Format currency value for PayOS - convert to integer without decimals
     * Returns a numeric value, not a string
     */
    private formatCurrencyForPayOS(amount: string | number): string {
        try {
            let numericAmount: number;
            if (typeof amount === 'string') {
                numericAmount = parseFloat(amount.replace(/[^\d.-]/g, ''));
            } else {
                numericAmount = amount;
            }
            if (isNaN(numericAmount)) {
                numericAmount = 0;
            }
            numericAmount = Math.round(Math.max(0, numericAmount));
            return numericAmount.toString();
        } catch (error) {
            this.logger.error('Error formatting currency value:', error);
            return '0';
        }
    }

    private buildSignatureString(data: any): string {
        const signatureFields = [
            'amount',
            'cancelUrl',
            'description',
            'orderCode',
            'returnUrl',
        ];
        const signatureParts = signatureFields
            .map((field) => {
                if (data[field]) {
                    return `${field}=${data[field]}`;
                }
                return null;
            })
            .filter(Boolean);
        return signatureParts.join('&');
    }

    private generateSignature(data: string): string {
        return crypto
            .createHmac('sha256', this.checksum)
            .update(data)
            .digest('hex');
    }

    async checkPaymentStatus(orderCode: string) {
        try {
            const response = await axios.get(
                `${this.apiUrl}/v2/payment-requests/${orderCode}`,
                {
                    headers: {
                        'x-client-id': this.clientId,
                        'x-api-key': this.apiKey,
                    },
                },
            );
            if (response.data && response.data.code === '00') {
                return {
                    success: true,
                    data: response.data.data || response.data,
                };
            } else {
                return {
                    success: false,
                    message:
                        response.data?.desc || 'Failed to check payment status',
                    data: response.data,
                };
            }
        } catch (error) {
            this.logger.error('Error checking payment status:', error);
            return {
                success: false,
                message:
                    error.message ||
                    'An error occurred when checking payment status',
            };
        }
    }

    /**
     * Verify payment webhook from PayOS
     * @param payload The webhook payload
     * @param headers The webhook headers
     * @returns Object with verification result
     */
    async verifyPaymentWebhook(payload: any, headers: any) {
        try {
            if (!payload) {
                return {
                    success: false,
                    message: 'Invalid payload',
                };
            }
            const paymentStatus = payload.status || payload.payment_status;
            const orderCode = payload.orderCode || payload.order_code;
            const orderId = payload.orderId || payload.order_id;
            const transactionId =
                payload.transactionId || payload.transaction_id;
            if (!paymentStatus || !orderCode) {
                return {
                    success: false,
                    message: 'Missing required webhook data',
                };
            }
            return {
                success: true,
                data: {
                    status: paymentStatus,
                    orderCode,
                    orderId,
                    transactionId,
                },
            };
        } catch (error) {
            this.logger.error('Error verifying webhook:', error);
            return {
                success: false,
                message: error.message || 'Failed to verify webhook',
            };
        }
    }

    /**
     * Get payment details by PayOS transaction ID
     * @param transactionId PayOS transaction ID
     */
    async getPaymentDetails(transactionId: string) {
        try {
            // Call PayOS API to get transaction details
            const response = await fetch(
                `${this.apiUrl}/v2/payment-requests/${transactionId}`,
                {
                    method: 'GET',
                    headers: {
                        'x-client-id': this.clientId,
                        'x-api-key': this.apiKey,
                    },
                },
            );
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Failed to get transaction: ${response.status} - ${errorText}`,
                );
            }
            const data = await response.json();
            return {
                success: true,
                data: data,
            };
        } catch (error) {
            this.logger.error(
                `Error fetching payment details: ${error.message}`,
            );
            return {
                success: false,
                message: error.message || 'Failed to get payment details',
            };
        }
    }
}
