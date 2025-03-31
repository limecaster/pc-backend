import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ChatbotService {
    private readonly api_url: string;
    private readonly logger = new Logger(ChatbotService.name);

    constructor(private configService: ConfigService) {
        this.api_url = this.configService.get<string>('CHATBOT_API_URL');
    }

    async clientChat(body: any) {
        const { message } = body;
        try {
            const body = JSON.stringify({ message: message });

            const response = await axios.post(
                `${this.api_url}/client-chat`,
                body,
                { headers: { 'Content-Type': 'application/json' } },
            );
            return response.data;
        } catch (error) {
            this.logger.error(error);
            throw new Error(error);
        }
    }
}
