import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    CmsContent,
    ContentStatus,
    ContentType,
    ContentSection,
} from './cms-content.entity';
import { CloudinaryConfigService } from '../../config/cloudinary.config';

@Injectable()
export class CmsService {
    private readonly logger = new Logger(CmsService.name);

    constructor(
        @InjectRepository(CmsContent)
        private cmsContentRepository: Repository<CmsContent>,
        private cloudinaryService: CloudinaryConfigService,
    ) {}

    async findAll(filters?: any): Promise<CmsContent[]> {
        const query = this.cmsContentRepository.createQueryBuilder('cms');

        if (filters) {
            if (filters.contentType) {
                query.andWhere('cms.contentType = :contentType', {
                    contentType: filters.contentType,
                });
            }
            if (filters.section) {
                query.andWhere('cms.section = :section', {
                    section: filters.section,
                });
            }
            if (filters.status) {
                query.andWhere('cms.status = :status', {
                    status: filters.status,
                });
            }
        }

        return query.orderBy('cms.displayOrder', 'ASC').getMany();
    }

    async findOne(id: number): Promise<CmsContent> {
        const content = await this.cmsContentRepository.findOne({
            where: { id },
        });
        if (!content) {
            throw new NotFoundException(`CMS content with ID ${id} not found`);
        }
        return content;
    }

    async findByKey(contentKey: string): Promise<CmsContent> {
        const content = await this.cmsContentRepository.findOne({
            where: { contentKey },
        });
        if (!content) {
            throw new NotFoundException(
                `CMS content with key ${contentKey} not found`,
            );
        }
        return content;
    }

    async create(contentData: Partial<CmsContent>): Promise<CmsContent> {
        // Validate displayOrder - ensure it's a valid number
        if (contentData.displayOrder !== undefined) {
            if (isNaN(Number(contentData.displayOrder))) {
                contentData.displayOrder = 0; // Default to 0 if NaN
            } else {
                contentData.displayOrder = Number(contentData.displayOrder);
            }
        }

        const newContent = this.cmsContentRepository.create(contentData);
        return this.cmsContentRepository.save(newContent);
    }

    async update(
        id: number,
        contentData: Partial<CmsContent>,
    ): Promise<CmsContent> {
        const content = await this.findOne(id);

        // Validate displayOrder - ensure it's a valid number
        if (contentData.displayOrder !== undefined) {
            if (isNaN(Number(contentData.displayOrder))) {
                contentData.displayOrder = 0; // Default to 0 if NaN
            } else {
                contentData.displayOrder = Number(contentData.displayOrder);
            }
        }

        // Update the content with new data
        Object.assign(content, contentData);

        return this.cmsContentRepository.save(content);
    }

    async remove(id: number): Promise<void> {
        const content = await this.findOne(id);

        // If there's a Cloudinary image, delete it first
        if (content.cloudinaryPublicId) {
            try {
                await this.cloudinaryService.deleteImage(
                    content.cloudinaryPublicId,
                );
            } catch (error) {
                this.logger.error(
                    `Failed to delete image from Cloudinary: ${error.message}`,
                );
                // Continue with deletion even if Cloudinary delete fails
            }
        }

        await this.cmsContentRepository.remove(content);
    }

    async uploadImage(
        file: Express.Multer['File'],
        folder: string = 'cms',
    ): Promise<any> {
        return this.cloudinaryService.uploadImage(file, folder);
    }
}
