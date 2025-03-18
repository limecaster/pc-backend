import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class PostgresConfigService {
    private pool: Pool;

    constructor(private configService: ConfigService) {
        this.pool = new Pool({
            user: this.configService.get<string>('POSTGRES_USER'),
            host: this.configService.get<string>('POSTGRES_HOST'),
            database: this.configService.get<string>('POSTGRES_NAME'),
            password: this.configService.get<string>('POSTGRES_PASSWORD'),
            port: this.configService.get<number>('POSTGRES_PORT'),
        });
    }

    getPool(): Pool {
        return this.pool;
    }
}
