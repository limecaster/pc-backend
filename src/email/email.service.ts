import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
    private resend: Resend;
    private readonly logger = new Logger(EmailService.name);
    private readonly isDev: boolean;

    constructor(private configService: ConfigService) {
        this.isDev = this.configService.get('NODE_ENV') !== 'production';
        this.resend = new Resend(this.configService.get('RESEND_API_KEY'));
    }

    async sendVerificationEmail(
        to: string,
        otp: string,
        name: string = '',
    ): Promise<void> {
        const subject = 'Xác thực tài khoản B Store';
        const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7e9; border-radius: 5px;">
        <h2 style="color: #333; text-align: center;">Xác thực tài khoản B Store</h2>
        <p>Xin chào${name ? ' ' + name : ''},</p>
        <p>Cảm ơn bạn đã đăng ký tài khoản tại B Store. Vui lòng sử dụng mã OTP dưới đây để xác thực tài khoản của bạn:</p>
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; margin: 20px 0; border-radius: 4px;">
          <h3 style="margin: 0; font-size: 24px; letter-spacing: 5px;">${otp}</h3>
        </div>
        <p>Mã OTP này có hiệu lực trong 15 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
        <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
        <p style="margin-top: 30px;">Trân trọng,<br>Đội ngũ B Store</p>
      </div>
    `;

        await this.sendMail(to, subject, html);
    }

    async sendPasswordResetEmail(
        to: string,
        otp: string,
        name: string = '',
    ): Promise<void> {
        const subject = 'Đặt lại mật khẩu B Store';
        const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7e9; border-radius: 5px;">
        <h2 style="color: #333; text-align: center;">Đặt lại mật khẩu B Store</h2>
        <p>Xin chào${name ? ' ' + name : ''},</p>
        <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Vui lòng sử dụng mã OTP dưới đây để xác nhận yêu cầu:</p>
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; margin: 20px 0; border-radius: 4px;">
          <h3 style="margin: 0; font-size: 24px; letter-spacing: 5px;">${otp}</h3>
        </div>
        <p>Mã OTP này có hiệu lực trong 15 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
        <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này và đảm bảo rằng bạn vẫn có thể truy cập vào tài khoản của mình.</p>
        <p style="margin-top: 30px;">Trân trọng,<br>Đội ngũ B Store</p>
      </div>
    `;

        await this.sendMail(to, subject, html);
    }

    /**
     * Sends an OTP code for order tracking verification
     * @param to Email to send to
     * @param otp OTP code
     * @param orderNumber Order number being tracked
     */
    async sendOrderTrackingOTP(
        to: string,
        otp: string,
        orderNumber: string,
    ): Promise<void> {
        const subject = 'Mã xác thực theo dõi đơn hàng B Store';
        const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7e9; border-radius: 5px;">
        <h2 style="color: #333; text-align: center;">Xác thực theo dõi đơn hàng B Store</h2>
        <p>Xin chào,</p>
        <p>Chúng tôi nhận được yêu cầu theo dõi thông tin đơn hàng #${orderNumber}. Vui lòng sử dụng mã OTP dưới đây để xác thực:</p>
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; margin: 20px 0; border-radius: 4px;">
          <h3 style="margin: 0; font-size: 24px; letter-spacing: 5px;">${otp}</h3>
        </div>
        <p>Mã OTP này có hiệu lực trong 15 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
        <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
        <p style="margin-top: 30px;">Trân trọng,<br>Đội ngũ B Store</p>
      </div>
    `;

        await this.sendMail(to, subject, html);
    }

    /**
     * Sends an email notification when an order is approved
     * @param to Customer email address
     * @param orderNumber Order number for reference
     * @param orderDetails Order details including ID, total, etc.
     */
    async sendOrderApprovalEmail(
        to: string,
        orderNumber: string,
        orderDetails: any,
    ): Promise<void> {
        const subject = 'Đơn hàng của bạn đã được xác nhận - B Store';

        // Format the payment link
        const paymentLink = `${this.configService.get('WEBSITE_DOMAIN_NAME', 'http://localhost:3000')}/dashboard/orders`;

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7e9; border-radius: 5px;">
            <h2 style="color: #333; text-align: center;">Đơn hàng đã được xác nhận</h2>
            <p>Xin chào,</p>
            <p>Đơn hàng <strong>#${orderNumber}</strong> của bạn đã được xác nhận.</p>
            <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0;"><strong>Tổng giá trị:</strong> ${this.formatPrice(orderDetails.total)} VNĐ</p>
              <p style="margin: 10px 0 0;"><strong>Ngày đặt hàng:</strong> ${new Date(orderDetails.orderDate).toLocaleDateString('vi-VN')}</p>
            </div>
            <p>Vui lòng tiến hành thanh toán để chúng tôi có thể xử lý đơn hàng của bạn:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${paymentLink}" style="background-color: #1435C3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Thanh toán đơn hàng</a>
            </div>
            <p>Nếu bạn đã thanh toán, vui lòng bỏ qua thông báo này.</p>
            <p>Cảm ơn bạn đã mua hàng tại B Store!</p>
            <p style="margin-top: 30px;">Trân trọng,<br>Đội ngũ B Store</p>
          </div>
        `;

        await this.sendMail(to, subject, html);
    }

    /**
     * Helper method to format price as VND currency
     */
    private formatPrice(price: string | number): string {
        const numPrice = typeof price === 'string' ? parseFloat(price) : price;
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            minimumFractionDigits: 0,
        }).format(numPrice);
    }

    private async sendMail(
        to: string,
        subject: string,
        html: string,
    ): Promise<void> {
        const from = this.configService.get('RESEND_FROM', 'noreply@bstore.com');
        if (!this.resend) {
            this.logger.warn(
                `Resend client not initialized. Would send email to ${to} but no valid client is configured`,
            );
            return;
        }
        try {
            await this.resend.emails.send({
                from,
                to,
                subject,
                html,
            });
        } catch (error) {
            this.logger.error(`Failed to send email to ${to}:`, error);
            if (!this.isDev) {
                throw new Error('Failed to send email');
            }
        }
    }

    async sendFAQAnswer(
        to: string,
        name: string,
        subject: string,
        question: string,
        answer: string,
    ): Promise<void> {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7e9; border-radius: 5px;">
                <h2 style="color: #333; text-align: center;">Câu trả lời cho câu hỏi của bạn</h2>
                <p>Xin chào ${name},</p>
                <p>Cảm ơn bạn đã gửi câu hỏi cho chúng tôi. Dưới đây là câu trả lời của chúng tôi:</p>
                
                <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <h3 style="color: #333; margin-bottom: 10px;">Câu hỏi của bạn:</h3>
                    <p style="margin: 0;">${question}</p>
                </div>

                <div style="background-color: #e8f4f8; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <h3 style="color: #333; margin-bottom: 10px;">Câu trả lời:</h3>
                    <p style="margin: 0;">${answer}</p>
                </div>

                <p>Nếu bạn có thêm câu hỏi, vui lòng liên hệ với chúng tôi.</p>
                <p style="margin-top: 30px;">Trân trọng,<br>Đội ngũ B Store</p>
            </div>
        `;

        await this.sendMail(to, `Trả lời: ${subject}`, html);
    }
}
