import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../customer/customer.entity';
import { Address } from '../../customer/address.entity';
import { ProfileDto, PasswordChangeDto } from './dto/profile.dto';
import { AddressDto } from './dto/address.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Customer)
    private userRepository: Repository<Customer>,
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
  ) {}

  async getProfile(userId: number): Promise<ProfileDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    return {
      firstName: user.firstname,  // Changed to match entity property name
      lastName: user.lastname,    // Changed to match entity property name
      email: user.email,
      phoneNumber: user.phoneNumber,
    };
  }

  async updateProfile(userId: number, profileDto: ProfileDto): Promise<ProfileDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    // Check if email is already taken by another user
    if (profileDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({ 
        where: { email: profileDto.email } 
      });
      
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException('Email already in use');
      }
    }

    user.firstname = profileDto.firstName; // Changed to match entity property name
    user.lastname = profileDto.lastName;   // Changed to match entity property name 
    user.email = profileDto.email;
    user.phoneNumber = profileDto.phoneNumber;

    await this.userRepository.save(user);
    return this.getProfile(userId);
  }

  async changePassword(userId: number, passwordDto: PasswordChangeDto): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const isPasswordValid = await bcrypt.compare(
      passwordDto.currentPassword,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(passwordDto.newPassword, 10);
    user.password = hashedPassword;
    await this.userRepository.save(user);
  }

  async getAddresses(userId: number): Promise<Address[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['addresses'],
    });
    
    if (!user) {
      throw new NotFoundException('Customer not found');
    }
    
    return user.addresses || [];
  }

  async addAddress(userId: number, addressDto: AddressDto): Promise<Address> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const address = this.addressRepository.create({
      ...addressDto,
      user,
    });
    
    return this.addressRepository.save(address);
  }

  async updateAddress(userId: number, addressId: number, addressDto: AddressDto): Promise<Address> {
    const address = await this.addressRepository.findOne({
      where: { id: addressId, user: { id: userId } },
    });
    
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    
    Object.assign(address, addressDto);
    return this.addressRepository.save(address);
  }

  async deleteAddress(userId: number, addressId: number): Promise<void> {
    const address = await this.addressRepository.findOne({
      where: { id: addressId, user: { id: userId } },
    });
    
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    
    await this.addressRepository.remove(address);
  }
}
