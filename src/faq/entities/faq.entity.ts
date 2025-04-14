import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Staff } from '../../staff/staff.entity';

@Entity()
export class FAQ {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column()
    email: string;

    @Column()
    subject: string;

    @Column('text')
    message: string;

    @Column({ default: 'pending' })
    status: 'pending' | 'answered';

    @Column('text', { nullable: true })
    answer: string;

    @ManyToOne(() => Staff, { nullable: true })
    answered_by: Staff;

    @Column({ nullable: true })
    answered_at: Date;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
