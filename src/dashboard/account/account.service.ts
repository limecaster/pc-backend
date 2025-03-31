import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Customer } from '../../customer/customer.entity';
import { Address } from '../../customer/address.entity';
import { ProfileDto, PasswordChangeDto } from './dto/profile.dto';
import { AddressDto } from './dto/address.dto';

@Injectable()
export class AccountService {
    constructor(
        @InjectRepository(Customer)
        private readonly customerRepository: Repository<Customer>,
        @InjectRepository(Address)
        private readonly addressRepository: Repository<Address>,
    ) {}

    async getProfile(customerId: number) {
        const customer = await this.customerRepository.findOne({
            where: { id: customerId },
        });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        // Format birthday to YYYY-MM-DD for HTML date input if it exists
        let formattedBirthday = '';
        if (customer.birthday) {
            try {
                formattedBirthday = customer.birthday
                    .toISOString()
                    .split('T')[0];
            } catch (error) {
                console.error('Error formatting birthday:', error);
            }
        }

        return {
            fullName: `${customer.firstname} ${customer.lastname}`,
            email: customer.email,
            phone: customer.phoneNumber || '',
            birthday: formattedBirthday,
            gender: customer.gender || 'male',
        };
    }

    async updateProfile(customerId: number, profileDto: ProfileDto) {
        const customer = await this.customerRepository.findOne({
            where: { id: customerId },
        });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        // Split the full name into first and last name (simple approach)
        const nameParts = profileDto.fullName.trim().split(' ');
        let firstname = '';
        let lastname = '';

        if (nameParts.length > 1) {
            lastname = nameParts.pop();
            firstname = nameParts.join(' ');
        } else if (nameParts.length === 1) {
            firstname = nameParts[0];
            lastname = '';
        }

        // Update customer fields
        customer.firstname = firstname;
        customer.lastname = lastname;
        customer.phoneNumber = profileDto.phone;

        // Add these fields to Customer entity if needed
        customer.birthday = new Date(profileDto.birthday.replace(/-/g, '/'));
        customer.gender = profileDto.gender;

        await this.customerRepository.save(customer);
        return { success: true, message: 'Profile updated successfully' };
    }

    async changePassword(customerId: number, passwordDto: PasswordChangeDto) {
        if (passwordDto.newPassword !== passwordDto.confirmPassword) {
            throw new BadRequestException(
                'New password and confirm password do not match',
            );
        }

        const customer = await this.customerRepository.findOne({
            where: { id: customerId },
        });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(
            passwordDto.currentPassword,
            customer.password,
        );
        if (!isPasswordValid) {
            throw new BadRequestException('Current password is incorrect');
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(passwordDto.newPassword, 10);
        customer.password = hashedPassword;

        await this.customerRepository.save(customer);
        return { success: true, message: 'Password updated successfully' };
    }

    async getAddresses(customerId: number) {
        return this.addressRepository.find({
            where: { customerId },
            order: { isDefault: 'DESC', updatedAt: 'DESC' },
        });
    }

    async addAddress(customerId: number, addressDto: AddressDto) {
        const customer = await this.customerRepository.findOne({
            where: { id: customerId },
        });
        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        // If this is the first address or marked as default
        const isFirstAddress =
            (await this.addressRepository.count({ where: { customerId } })) ===
            0;
        const isDefault = isFirstAddress || !!addressDto.isDefault;

        // If setting this address as default, unset any existing default
        if (isDefault) {
            await this.addressRepository.update(
                { customerId, isDefault: true },
                { isDefault: false },
            );
        }

        const address = this.addressRepository.create({
            ...addressDto,
            customerId,
            isDefault,
        });

        await this.addressRepository.save(address);
        return address;
    }

    async updateAddress(
        customerId: number,
        addressId: number,
        addressDto: AddressDto,
    ) {
        const address = await this.addressRepository.findOne({
            where: { id: addressId, customerId },
        });
        if (!address) {
            throw new NotFoundException('Address not found');
        }

        // If setting as default, unset any existing default
        if (addressDto.isDefault) {
            await this.addressRepository.update(
                { customerId, isDefault: true },
                { isDefault: false },
            );
        }

        Object.assign(address, addressDto);
        return this.addressRepository.save(address);
    }

    async deleteAddress(customerId: number, addressId: number) {
        const address = await this.addressRepository.findOne({
            where: { id: addressId, customerId },
        });
        if (!address) {
            throw new NotFoundException('Address not found');
        }

        await this.addressRepository.remove(address);

        // If deleted address was default, set another address as default
        if (address.isDefault) {
            const nextAddress = await this.addressRepository.findOne({
                where: { customerId },
                order: { createdAt: 'DESC' },
            });

            if (nextAddress) {
                nextAddress.isDefault = true;
                await this.addressRepository.save(nextAddress);
            }
        }

        return { success: true };
    }
}
