import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
    private transporter: nodemailer.Transporter;
    private readonly logger = new Logger(EmailService.name);
    private readonly isDev: boolean;

    constructor(private configService: ConfigService) {
        this.isDev = this.configService.get('NODE_ENV') !== 'production';
        this.setupTransporter();
    }

    private async setupTransporter() {
        // Check if we're in dev mode and no valid credentials are set
        const mailUser = this.configService.get('MAIL_USER');
        const mailPassword = this.configService.get('MAIL_PASSWORD');
        if (
            this.isDev &&
            (!mailUser ||
                !mailPassword ||
                mailUser === 'your_email@gmail.com' ||
                mailPassword === 'your_app_password')
        ) {
            // Create a test account on ethereal.email for development
            this.logger.log('Creating test email account on Ethereal...');
            try {
                const testAccount = await nodemailer.createTestAccount();
                this.logger.log(
                    `Test email account created: ${testAccount.user}`,
                );

                // Configure the transporter with the test credentials
                this.transporter = nodemailer.createTransport({
                    host: 'smtp.ethereal.email',
                    port: 587,
                    secure: false,
                    auth: {
                        user: testAccount.user,
                        pass: testAccount.pass,
                    },
                });

                this.logger.log('Test email transporter created');
                this.logger.log(
                    'For production, please set up proper Gmail credentials in .env file',
                );
                this.logger.log('For Gmail, make sure to:');
                this.logger.log(
                    '1. Enable 2-Step Verification on your Google account',
                );
                this.logger.log(
                    '2. Create an App Password at https://myaccount.google.com/apppasswords',
                );
                this.logger.log('3. Use that App Password in your .env file');
            } catch (error) {
                this.logger.error('Failed to create test email account', error);
                // In development, we'll just log emails to console
                this.logger.warn(
                    'Email sending will be simulated (logged to console only)',
                );
            }
        } else {
            // Use the configured email credentials
            try {
                if (
                    mailUser === 'your_email@gmail.com' ||
                    mailPassword === 'your_app_password'
                ) {
                    throw new Error(
                        'Please update your email credentials in .env file. These are placeholders only.',
                    );
                }

                this.transporter = nodemailer.createTransport({
                    host: this.configService.get('MAIL_HOST', 'smtp.gmail.com'),
                    port: parseInt(this.configService.get('MAIL_PORT', '587')),
                    secure:
                        this.configService.get('MAIL_SECURE', 'false') ===
                        'true',
                    auth: {
                        user: mailUser,
                        pass: mailPassword,
                    },
                });

                // Verify connection configuration
                try {
                    await this.transporter.verify();
                    this.logger.log(
                        'Email transporter configured successfully',
                    );
                } catch (verifyError) {
                    if (verifyError.code === 'EAUTH') {
                        this.logger.error(
                            'Gmail authentication failed. If using Gmail, please make sure:',
                        );
                        this.logger.error(
                            '1. You have enabled 2-Step Verification on your Google account',
                        );
                        this.logger.error(
                            '2. You are using an App Password, not your regular password',
                        );
                        this.logger.error(
                            '3. The App Password is entered correctly (16 characters without spaces)',
                        );
                        this.logger.error(
                            'Create App Password at: https://myaccount.google.com/apppasswords',
                        );
                    }
                    throw verifyError;
                }
            } catch (error) {
                this.logger.error('Failed to set up email transporter', error);
                this.logger.warn(
                    'Email sending will be simulated (logged to console only)',
                );
                this.transporter = null;
            }
        }
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
     * @param orderId Order ID being tracked
     */
    async sendOrderTrackingOTP(
        to: string,
        otp: string,
        orderId: string,
    ): Promise<void> {
        const subject = 'Mã xác thực theo dõi đơn hàng B Store';
        const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e7e9; border-radius: 5px;">
        <h2 style="color: #333; text-align: center;">Xác thực theo dõi đơn hàng B Store</h2>
        <p>Xin chào,</p>
        <p>Chúng tôi nhận được yêu cầu theo dõi thông tin đơn hàng #${orderId}. Vui lòng sử dụng mã OTP dưới đây để xác thực:</p>
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
        const paymentLink = `${this.configService.get('FRONTEND_URL', 'http://localhost:3000')}/dashboard/orders`;

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
        // Always log the email in dev mode, regardless of whether we'll send it or not
        if (this.isDev) {
            this.logger.debug(`
===== EMAIL =====
To: ${to}
Subject: ${subject}
Content: ${html.substring(0, 100)}...
================
      `);
        }

        // If we don't have a transporter, just log and return
        if (!this.transporter) {
            this.logger.warn(
                `Would send email to ${to} but no valid transporter is configured`,
            );
            return;
        }

        try {
            const info = await this.transporter.sendMail({
                from: `"B Store" <${this.configService.get('MAIL_FROM', 'noreply@bstore.com')}>`,
                to,
                subject,
                html,
            });

            if (this.isDev) {
                // If using Ethereal, log the preview URL
                if (info.messageId && info.preview) {
                    this.logger.log(`Email sent: ${info.messageId}`);
                    this.logger.log(
                        `Preview URL: ${nodemailer.getTestMessageUrl(info)}`,
                    );
                } else {
                    this.logger.log(
                        `Email sent to ${to} with subject: ${subject} with otp: ${html}`,
                    );
                }
            }
        } catch (error) {
            this.logger.error(`Failed to send email to ${to}:`, error);
            // In development, we don't want to fail the application just because email sending failed
            if (!this.isDev) {
                throw new Error('Failed to send email');
            }
        }
    }
}
