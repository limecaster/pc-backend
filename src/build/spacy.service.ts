import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SpacyService {

    private readonly logger = new Logger(SpacyService.name);
    private readonly spacyApiUrl: string;

    constructor(private configService: ConfigService) {
        this.spacyApiUrl = this.configService.get<string>('SPACY_API_URL');
    }

    async extractStructuredData(text: string) {
        try {
            const response = await axios.post(`${this.spacyApiUrl || 'http://localhost:8000'}/extract`, {
                text,
            });
            return response.data.data;
        } catch (error) {
            this.logger.error(error);
            throw new HttpException(
                error.response?.data || 'Error extracting structured data',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}
