import {
    createParamDecorator,
    ExecutionContext,
    BadRequestException,
} from '@nestjs/common';

export const ParseDate = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const value = request.query[data as string];

        if (!value) return undefined;

        try {
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
