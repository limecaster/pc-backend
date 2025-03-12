import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO for sending an OTP code to verify order tracking access
 */
export class SendOTPDto {
    @IsNotEmpty({ message: 'Order ID is required' })
    @IsString({ message: 'Order ID must be provided' })
    orderId: string;

    @IsNotEmpty({ message: 'Email is required' })
    @IsEmail({}, { message: 'Invalid email format' })
    email: string;
}

/**
 * DTO for verifying an OTP code to access order tracking details
 */
export class VerifyOTPDto {
    @IsNotEmpty({ message: 'Order ID is required' })
    @IsString({ message: 'Order ID must be provided' })
    orderId: string;

    @IsNotEmpty({ message: 'Email is required' })
    @IsEmail({}, { message: 'Invalid email format' })
    email: string;

    @IsNotEmpty({ message: 'OTP code is required' })
    @IsString({ message: 'OTP code must be a string' })
    otp: string;
}
