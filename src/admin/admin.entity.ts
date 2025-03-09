import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('Admin')
export class Admin {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 50 })
    firstname: string;

    @Column({ length: 50 })
    lastname: string;

    @Column({ name: 'phone_number', nullable: true, length: 20 })
    phoneNumber: string;

    @Column({ unique: true, length: 50 })
    username: string;

    @Column()
    password: string;

    @Column({ unique: true, length: 100 })
    email: string;

    @Column({ nullable: true })
    street: string;

    @Column({ nullable: true })
    ward: string;

    @Column({ nullable: true })
    district: string;

    @Column({ nullable: true })
    city: string;

    @Column({ name: 'latest_login', type: 'timestamp', nullable: true })
    latestLogin: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
