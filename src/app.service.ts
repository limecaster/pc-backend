import { Injectable } from '@nestjs/common';
import { PostgresConfigService } from 'config/postgres.config';
@Injectable()
export class AppService {

  constructor(private postgresConfigService: PostgresConfigService) {}
  getHello(): string {
    return 'Hello World!';
  }
  // Test the connection to the database
  async testConnection(): Promise<string> {
    const pool = this.postgresConfigService.getPool();
    const result = await pool.query('SELECT current_database()');
    return result.rows[0];
  }
}
