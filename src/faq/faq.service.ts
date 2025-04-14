import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FAQ } from './entities/faq.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class FAQService {
    constructor(
        @InjectRepository(FAQ)
        private faqRepository: Repository<FAQ>,
        private emailService: EmailService,
    ) {}

    async create(createFAQDto: {
        name: string;
        email: string;
        subject: string;
        message: string;
    }): Promise<FAQ> {
        const faq = this.faqRepository.create(createFAQDto);
        return await this.faqRepository.save(faq);
    }

    async findAll(): Promise<FAQ[]> {
        return await this.faqRepository.find({
            order: {
                created_at: 'DESC',
            },
        });
    }

    async answer(id: number, answer: string, staffId: number): Promise<FAQ> {
        const faq = await this.faqRepository.findOne({ where: { id } });
        if (!faq) {
            throw new Error('FAQ not found');
        }

        faq.answer = answer;
        faq.status = 'answered';
        faq.answered_by = { id: staffId } as any;
        faq.answered_at = new Date();

        const updatedFAQ = await this.faqRepository.save(faq);

        // Send email to the user
        await this.emailService.sendFAQAnswer(
            faq.email,
            faq.name,
            faq.subject,
            faq.message,
            answer,
        );

        return updatedFAQ;
    }
}
