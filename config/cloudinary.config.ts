import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryResponse } from '../src/interfaces/cloudinary-response.interface';
import { Readable } from 'stream';

// Import the correct Multer type
import * as multer from 'multer';

@Injectable()
export class CloudinaryConfigService {
    constructor(private configService: ConfigService) {
        cloudinary.config({
            cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
            api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
            api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
        });
    }

    async uploadImage(
        file: multer.Multer['File'], // Use correct type reference
        folder: string = 'products',
    ): Promise<CloudinaryResponse> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    resource_type: 'auto',
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                },
            );

            // Convert buffer to stream for Cloudinary
            const bufferToStream = Readable.from(file.buffer);
            bufferToStream.pipe(uploadStream);
        });
    }

    async deleteImage(publicId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            cloudinary.uploader.destroy(publicId, (error, result) => {
                if (error) return reject(error);
                resolve(result);
            });
        });
    }
}
