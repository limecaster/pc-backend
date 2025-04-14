import {
    createParamDecorator,
    ExecutionContext,
    BadRequestException,
} from '@nestjs/common';

export const ParseDate = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const rawValue = request.query[data as string];

        if (!rawValue) return undefined;

        try {
            const value = String(rawValue).trim();
            const date = new Date(value);

            // Check if the date is valid
            if (isNaN(date.getTime())) {
                throw new BadRequestException(
                    `Invalid date format for ${data}`,
                );
            }
            return date;
        } catch (error) {
            throw new BadRequestException(`Invalid date format for ${data}`);
        }
    },
);
