import { Controller, Get, Post, Body, Param, UseGuards, Req } from "@nestjs/common";
import { FAQService } from "./faq.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Role } from "../auth/enums/role.enum";

@Controller("faq")
export class FAQController {
    constructor(private readonly faqService: FAQService) {}

    @Post()
    async create(@Body() createFAQDto: {
        name: string;
        email: string;
        subject: string;
        message: string;
    }) {
        return await this.faqService.create(createFAQDto);
    }

    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.STAFF)
    async findAll() {
        return await this.faqService.findAll();
    }

    @Post(":id/answer")
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.STAFF)
    async answer(
        @Param("id") id: string,
        @Body() body: { answer: string },
        @Req() req: any,
    ) {
        return await this.faqService.answer(
            parseInt(id),
            body.answer,
            req.user.id,
        );
    }
} 