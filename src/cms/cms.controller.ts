import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Logger,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CmsService } from './cms.service';
import {
    CmsContent,
    ContentType,
    ContentSection,
    ContentStatus,
} from './cms-content.entity';

@Controller('cms')
export class CmsController {
    private readonly logger = new Logger(CmsController.name);

    constructor(private readonly cmsService: CmsService) {}

    @Get()
    async findAll(@Query() query: any): Promise<CmsContent[]> {
        return this.cmsService.findAll(query);
    }

    @Get(':id')
    async findOne(@Param('id') id: number): Promise<CmsContent> {
        return this.cmsService.findOne(id);
    }

    @Get('key/:contentKey')
    async findByKey(
        @Param('contentKey') contentKey: string,
    ): Promise<CmsContent> {
        return this.cmsService.findByKey(contentKey);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async create(
        @Body() contentData: Partial<CmsContent>,
    ): Promise<CmsContent> {
        return this.cmsService.create(contentData);
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async update(
        @Param('id') id: number,
        @Body() contentData: Partial<CmsContent>,
    ): Promise<CmsContent> {
        return this.cmsService.update(id, contentData);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async remove(@Param('id') id: number): Promise<{ success: boolean }> {
        await this.cmsService.remove(id);
        return { success: true };
    }

    @Post('upload-image')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @UseInterceptors(FileInterceptor('image'))
    async uploadImage(
        @UploadedFile() file: Express.Multer['File'],
        @Query('folder') folder: string,
    ): Promise<any> {
        try {
            const result = await this.cmsService.uploadImage(
                file,
                folder || 'cms',
            );
            return {
                success: true,
                imageUrl: result.secure_url,
                publicId: result.public_id,
            };
        } catch (error) {
            this.logger.error(`Failed to upload image: ${error.message}`);
            return {
                success: false,
                message: error.message,
            };
        }
    }

    @Get('content-types')
    getContentTypes() {
        try {
            return Object.values(ContentType);
        } catch (error) {
            this.logger.error(`Failed to get content types: ${error.message}`);
            throw new Error(`Failed to get content types: ${error.message}`);
        }
    }

    @Get('content-sections')
    getContentSections() {
        try {
            return Object.values(ContentSection);
        } catch (error) {
            this.logger.error(
                `Failed to get content sections: ${error.message}`,
            );
            throw new Error(`Failed to get content sections: ${error.message}`);
        }
    }

    @Get('content-statuses')
    getContentStatuses() {
        try {
            return Object.values(ContentStatus);
        } catch (error) {
            this.logger.error(
                `Failed to get content statuses: ${error.message}`,
            );
            throw new Error(`Failed to get content statuses: ${error.message}`);
        }
    }
}
