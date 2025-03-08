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

    if (this.isDev && (!mailUser || !mailPassword)) {
      // Create a test account on ethereal.email for development
      this.logger.log('Creating test email account on Ethereal...');
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.logger.log(`Test email account created: ${testAccount.user}`);
        
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
      } catch (error) {
        this.logger.error('Failed to create test email account', error);
        // In development, we'll just log emails to console
        this.logger.warn('Email sending will be simulated (logged to console only)');
      }
    } else {
      // Use the configured email credentials
      try {
        this.transporter = nodemailer.createTransport({
          host: this.configService.get('MAIL_HOST', 'smtp.gmail.com'),
          port: parseInt(this.configService.get('MAIL_PORT', '587')),
          secure: this.configService.get('MAIL_SECURE', 'false') === 'true',
          auth: {
            user: mailUser,
            pass: mailPassword,
          },
        });
        
        // Verify connection configuration
        if (!this.isDev) {
          await this.transporter.verify();
          this.logger.log('Email transporter configured successfully');
        }
      } catch (error) {
        this.logger.error('Failed to set up email transporter', error);
        this.logger.warn('Email sending will be simulated (logged to console only)');
      }
    }
  }

  async sendVerificationEmail(to: string, otp: string, name: string = ''): Promise<void> {
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

  async sendPasswordResetEmail(to: string, otp: string, name: string = ''): Promise<void> {
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

  private async sendMail(to: string, subject: string, html: string): Promise<void> {
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
      this.logger.warn(`Would send email to ${to} but no valid transporter is configured`);
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
          this.logger.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        } else {
          this.logger.log(`Email sent to ${to} with subject: ${subject} with otp: ${html}`);
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