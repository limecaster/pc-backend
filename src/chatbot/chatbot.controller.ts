import { Get, Post, Body, Controller, Query, Param } from '@nestjs/common';
import { ChatbotService } from 'src/chatbot/chatbot.service';

@Controller('chatbot')
export class ChatbotController {
    constructor(private readonly chatbotService: ChatbotService) {}

    @Post('client-chat')
    async clientChat(@Body() body: any) {
        return this.chatbotService.clientChat(body);
    }
}
