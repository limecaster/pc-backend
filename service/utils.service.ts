import { Injectable } from '@nestjs/common';

@Injectable()
export class UtilsService {
    public combineLowHigh(low: number, high: number): number {
        return high * Math.pow(2, 32) + low;
    }
}
