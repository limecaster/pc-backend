import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';

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
    this.apiUrl = this.configService.get<string>('PAYOS_API_URL', 'https://api-merchant.payos.vn');

    if (!this.clientId || !this.apiKey || !this.checksum) {
      this.logger.warn('PayOS configuration is incomplete. Please check your environment variables.');
    } else {
      this.logger.log('PayOS service initialized');
    }
  }

  async createPaymentLink(paymentData: any) {
    try {
      // Generate order code as a numeric value (timestamp-based)
      // Make sure it's within safe integer range and sent as a NUMBER not a string
      const timestamp = Date.now();
      const orderCode = Number(timestamp % 100000000); // Use modulo to keep it small and convert to number
      
      // Format price and amount values as numbers (NOT strings)
      // PayOS requires numeric values
      const formattedAmount = this.formatCurrencyForPayOS(paymentData.total);
      
      // Make sure amount is within limits
      const numericAmount = Number(formattedAmount);
      if (numericAmount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      
      if (numericAmount >= 10000000000) {
        throw new Error('Amount must be less than 10,000,000,000 VND');
      }

      // Format items with constraint validation - using numeric values
      const formattedItems = paymentData.items.map(item => {
        // Convert price to a NUMBER
        const price = Number(this.formatCurrencyForPayOS(item.price));
        
        // Validate item price
        if (price <= 0) {
          throw new Error(`Item price for "${item.name}" must be greater than 0`);
        }
        
        if (price >= 10000000000) {
          throw new Error(`Item price for "${item.name}" must be less than 10,000,000,000 VND`);
        }
        
        return {
          name: item.name.substring(0, 50), // Limit name to a reasonable length
          quantity: item.quantity,
          price: price // Send as a number
        };
      });

      // Limit description to 25 characters as per API requirement
      const description = (paymentData.description || 'Thanh toan B Store').substring(0, 25);

      // Prepare payment request
      const paymentRequest = {
        orderCode: orderCode, // Now a NUMBER not a string
        amount: numericAmount, // Now a NUMBER not a string
        description,
        cancelUrl: paymentData.cancelUrl,
        returnUrl: paymentData.returnUrl,
        buyerName: (paymentData.customer?.fullName || '').substring(0, 50),
        buyerEmail: (paymentData.customer?.email || '').substring(0, 50),
        buyerPhone: (paymentData.customer?.phone || '').substring(0, 20),
        buyerAddress: (paymentData.customer?.address || '').substring(0, 100),
        items: formattedItems,
      };

      // Create signature
      const signatureString = this.buildSignatureString(paymentRequest);
      this.logger.log('Signature string:');
      this.logger.log(signatureString);

      const signature = this.generateSignature(signatureString);
      this.logger.log('Generated signature:');
      this.logger.log(signature);

      // Add signature to request
      const finalRequest = {
        ...paymentRequest,
        signature: signature
      };

      this.logger.log('Sending payment request to PayOS: ');
      this.logger.log(finalRequest);

      // Send request to PayOS API
      const response = await axios.post(
        `${this.apiUrl}/v2/payment-requests`,
        finalRequest,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': this.clientId,
            'x-api-key': this.apiKey,
          }
        }
      );

      this.logger.log('PayOS response status:');
      this.logger.log(response.status);
      this.logger.log('PayOS response data:');
      this.logger.log(response.data);

      if (response.data && response.data.code === '00') {
        // Fix: Extract values from the nested 'data' object correctly
        return {
          success: true,
          data: {
            checkoutUrl: response.data.data?.checkoutUrl,
            qrCode: response.data.data?.qrCode,
            orderCode: orderCode,
            paymentLinkId: response.data.data?.paymentLinkId
          }
        };
      } else {
        return {
          success: false,
          message: response.data?.desc || 'Failed to create payment link',
          data: response.data
        };
      }
    } catch (error) {
      // Check if there's a specific error related to payment URL
      if (error.response?.data?.desc) {
        this.logger.error(`PayOS error: ${error.response.data.desc}`);
        return {
          success: false,
          message: `PayOS error: ${error.response.data.desc}`,
          error: error.response.data
        };
      }
      
      this.logger.error('Error creating payment link:', error);
      return {
        success: false,
        message: error.message || 'An error occurred during payment processing',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Format currency value for PayOS - convert to integer without decimals
   * Returns a numeric value, not a string
   */
  private formatCurrencyForPayOS(amount: string | number): string {
    try {
      // Convert to number if it's a string
      let numericAmount: number;
      
      if (typeof amount === 'string') {
        numericAmount = parseFloat(amount.replace(/[^\d.-]/g, ''));
      } else {
        numericAmount = amount;
      }
      
      // Ensure it's a valid number
      if (isNaN(numericAmount)) {
        numericAmount = 0;
      }
      
      // Round to nearest integer (PayOS requires integer values for VND)
      numericAmount = Math.round(Math.max(0, numericAmount));
      
      // Return as string (we'll convert back to number when needed)
      return numericAmount.toString();
    } catch (error) {
      this.logger.error('Error formatting currency value:', error);
      return '0';
    }
  }

  private buildSignatureString(data: any): string {
    // Only include these fields in the signature calculation
    const signatureFields = [
      'amount',
      'cancelUrl',
      'description',
      'orderCode',
      'returnUrl'
    ];

    // Create signature string in format: key1=value1&key2=value2
    const signatureParts = signatureFields.map(field => {
      if (data[field]) {
        return `${field}=${data[field]}`;
      }
      return null;
    }).filter(Boolean);

    return signatureParts.join('&');
  }

  private generateSignature(data: string): string {
    return crypto.createHmac('sha256', this.checksum)
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
          }
        }
      );

      if (response.data && response.data.code === '00') {
        // Fix: Return the nested data structure correctly
        return {
          success: true,
          data: response.data.data || response.data
        };
      } else {
        return {
          success: false,
          message: response.data?.desc || 'Failed to check payment status',
          data: response.data
        };
      }
    } catch (error) {
      this.logger.error('Error checking payment status:', error);
      return {
        success: false,
        message: error.message || 'An error occurred when checking payment status'
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
      this.logger.log('Verifying payment webhook');
      
      // In a real implementation, you would verify the signature
      // This is a simplified example
      if (!payload) {
        return {
          success: false,
          message: 'Invalid payload'
        };
      }
      
      // Extract relevant information from the webhook payload
      // This will depend on your payment provider's webhook format
      const paymentStatus = payload.status || payload.payment_status;
      const orderCode = payload.orderCode || payload.order_code;
      const orderId = payload.orderId || payload.order_id;
      const transactionId = payload.transactionId || payload.transaction_id;
      
      if (!paymentStatus || !orderCode) {
        return {
          success: false,
          message: 'Missing required webhook data'
        };
      }
      
      // Return the processed webhook data
      return {
        success: true,
        data: {
          status: paymentStatus,
          orderCode,
          orderId,
          transactionId
        }
      };
    } catch (error) {
      this.logger.error('Error verifying webhook:', error);
      return {
        success: false,
        message: error.message || 'Failed to verify webhook'
      };
    }
  }
}
