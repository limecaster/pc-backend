import {
    IsString,
    IsOptional,
    IsEmail,
    IsNotEmpty,
    MinLength,
    Matches,
} from 'class-validator';

export class ProfileDto {
    @IsString()
    @IsNotEmpty()
    fullName: string;

    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    phone: string;

    @IsString()
    @IsOptional()
    birthday?: string;

    @IsString()
    @IsNotEmpty()
    gender: string;
}

export class PasswordChangeDto {
    @IsString()
    @IsNotEmpty()
    currentPassword: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]+$/, {
        message:
            'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    })
    newPassword: string;

    @IsString()
    @IsNotEmpty()
    confirmPassword: string;
}
