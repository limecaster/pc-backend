import { Injectable } from '@nestjs/common';

@Injectable()
export class UtilsService {
    public combineLowHigh(low: number, high: number): number {
        return high * Math.pow(2, 32) + low;
    }

    public isValidUUID(uuid: string): boolean {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            uuid,
        );
    }
}
