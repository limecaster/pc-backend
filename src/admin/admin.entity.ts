import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('Admin')
export class Admin {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    firstname: string;

    @Column()
    lastname: string;

    @Column({ nullable: true, name: 'phone_number' })
    phoneNumber: string;

    @Column({ unique: true })
    username: string;

    @Column()
    password: string;

    @Column({ default: 'active' })
    status: string;

    @Column({ unique: true })
    email: string;

    @Column({ nullable: true })
    street: string;

    @Column({ nullable: true })
    ward: string;

    @Column({ nullable: true })
    district: string;

    @Column({ nullable: true })
    city: string;

    @Column({ nullable: true, name: 'latest_login' })
    latestLogin: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
