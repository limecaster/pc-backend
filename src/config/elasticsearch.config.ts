import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { Logger } from '@nestjs/common';

@Injectable()
export class ElasticsearchConfigService {
    private readonly client: Client;
    private readonly logger = new Logger(ElasticsearchConfigService.name);

    constructor(private configService: ConfigService) {
        const host =
            this.configService.get<string>('ELASTICSEARCH_HOST') ||
            'http://localhost:9200';
        
        // Check if security is enabled (based on username/password being provided)
        const username = this.configService.get<string>('ELASTICSEARCH_USERNAME');
        const password = this.configService.get<string>('ELASTICSEARCH_PASSWORD');
        console.log(username, password);
        const securityEnabled = username && password && username.length > 0 && password.length > 0;
        
        if (securityEnabled) {
            // Configure with authentication
            this.logger.log('Configuring Elasticsearch with authentication');
            this.client = new Client({
                node: host,
                auth: {
                    username,
                    password,
                },
                tls: {
                    rejectUnauthorized: false,
                },
                maxRetries: 5,
                requestTimeout: 60000,
            });
        } else {
            // Configure without authentication for development
            this.logger.log('Configuring Elasticsearch without authentication');
            this.client = new Client({
                node: host,
                maxRetries: 5,
                requestTimeout: 60000,
            });
        }

        // Test connection
        this.testConnection();
    }

    async testConnection(): Promise<void> {
        try {
            const info = await this.client.info();
            this.logger.log(
                `Connected to Elasticsearch cluster: ${info.cluster_name || 'unknown'}`,
            );
        } catch (error) {
            this.logger.error(
                `Failed to connect to Elasticsearch: ${error.message}`,
            );
            this.logger.warn(
                'Search and suggestion features may not work properly',
            );
        }
    }

    getClient(): Client {
        return this.client;
    }
}
