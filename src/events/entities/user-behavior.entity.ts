import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    Index,
    CreateDateColumn,
} from 'typeorm';
import { Customer } from '../../customer/customer.entity';

@Entity('User_Behavior')
export class UserBehavior {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        type: 'uuid',
        name: 'event_id',
        default: () => 'uuid_generate_v4()',
    })
    eventId: string;

    @Column({ nullable: true, name: 'customer_id' })
    @Index()
    customerId: number;

    @ManyToOne(() => Customer, { nullable: true })
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @Column({ nullable: true, name: 'session_id' })
    sessionId: string;

    @Column({ name: 'event_type' })
    @Index()
    eventType: string;

    @Column({ name: 'entity_id', nullable: true })
    @Index()
    entityId: string;

    @Column({ name: 'entity_type', nullable: true })
    entityType: string;

    @Column({ name: 'page_url', nullable: true, type: 'text' })
    pageUrl: string;

    @Column({ name: 'referrer_url', nullable: true, type: 'text' })
    referrerUrl: string;

    @Column({ name: 'device_info', type: 'jsonb', nullable: true })
    deviceInfo: Record<string, any>;

    @Column({ name: 'ip_address', nullable: true })
    ipAddress: string;

    @Column({ name: 'event_data', type: 'jsonb', nullable: true })
    eventData: Record<string, any>;

    @CreateDateColumn({ name: 'created_at' })
    @Index()
    createdAt: Date;
}
