import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ChatbotService {
    async clientChat(body: any) {
        const { message } = body;
        try {
            const body = JSON.stringify({ message: message });
            console.log(body);
            const response = await axios.post(
                'http://0.0.0.0:8002/client-chat',
                body,
                { headers: { 'Content-Type': 'application/json' } },
            );
            console.log(response.data);
            return response.data;
        } catch (error) {
            throw new Error(error);
        } finally {
            console.log('Client Chat request sent');
        }
    }
}
