import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ElasticsearchConfigService } from '../../config/elasticsearch.config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../product.entity';
import { Client } from '@elastic/elasticsearch';

@Injectable()
export class ProductElasticsearchService implements OnModuleInit {
    private readonly logger = new Logger(ProductElasticsearchService.name);
    private readonly indexName = 'products';

    constructor(
        private readonly elasticsearchConfigService: ElasticsearchConfigService,
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
    ) {}

    async onModuleInit() {
        try {
            await this.createIndexIfNotExists();
            await this.ensureIndexMapping();

            // Check if index is empty and populate if needed
            const isEmpty = await this.isIndexEmpty();
            if (isEmpty) {
                this.logger.log(
                    'Elasticsearch index is empty, starting initial indexing...',
                );
                await this.reindexAllProducts();
            }
        } catch (error) {
            this.logger.error(
                `Error during Elasticsearch initialization: ${error.message}`,
            );
        }
    }

    private async createIndexIfNotExists() {
        const client = this.elasticsearchConfigService.getClient();
        try {
            const indexExists = await client.indices.exists({
                index: this.indexName,
            });

            if (!indexExists) {
                this.logger.log(`Creating index ${this.indexName}`);
                await client.indices.create({
                    index: this.indexName,
                    body: {
                        settings: {
                            analysis: {
                                analyzer: {
                                    product_analyzer: {
                                        type: 'custom',
                                        tokenizer: 'standard',
                                        filter: ['lowercase', 'asciifolding'],
                                    },
                                },
                            },
                        },
                    },
                });
                this.logger.log(`Index ${this.indexName} created successfully`);
            }
        } catch (error) {
            this.logger.error(`Error creating index: ${error.message}`);
        }
    }

    private async ensureIndexMapping() {
        const client = this.elasticsearchConfigService.getClient();
        try {
            await client.indices.putMapping({
                index: this.indexName,
                body: {
                    properties: {
                        id: { type: 'keyword' },
                        name: {
                            type: 'text',
                            analyzer: 'product_analyzer',
                            fields: {
                                keyword: {
                                    type: 'keyword',
                                    ignore_above: 256,
                                },
                            },
                        },
                        description: {
                            type: 'text',
                            analyzer: 'product_analyzer',
                        },
                        category: { type: 'keyword' },
                        price: { type: 'float' },
                        brand: { type: 'keyword' },
                        status: { type: 'keyword' },
                        specifications: {
                            type: 'object',
                            enabled: false,
                        },
                        created_at: { type: 'date' },
                    },
                },
            });
            this.logger.log('Product index mapping updated');
        } catch (error) {
            this.logger.error(`Error updating mapping: ${error.message}`);
        }
    }

    private async isIndexEmpty(): Promise<boolean> {
        const client = this.elasticsearchConfigService.getClient();
        try {
            const { count } = await client.count({ index: this.indexName });
            return count === 0;
        } catch (error) {
            this.logger.error(
                `Error checking if index is empty: ${error.message}`,
            );
            return true; // Assume empty if error occurs
        }
    }

    async indexProduct(product: any): Promise<void> {
        const client = this.elasticsearchConfigService.getClient();
        try {
            await client.index({
                index: this.indexName,
                id: product.id,
                body: product,
            });
        } catch (error) {
            this.logger.error(`Error indexing product: ${error.message}`);
        }
    }

    async bulkIndexProducts(products: any[]): Promise<void> {
        if (products.length === 0) {
            return;
        }

        const client = this.elasticsearchConfigService.getClient();
        const operations = products.flatMap((product) => [
            { index: { _index: this.indexName, _id: product.id } },
            product,
        ]);

        try {
            await client.bulk({ body: operations, refresh: true });
            this.logger.log(`Bulk indexed ${products.length} products`);
        } catch (error) {
            this.logger.error(`Error bulk indexing products: ${error.message}`);
        }
    }

    async reindexAllProducts(): Promise<void> {
        try {
            this.logger.log('Starting full reindex of products');

            // Get all active products from database
            let page = 1;
            const pageSize = 100;
            let hasMore = true;

            while (hasMore) {
                const offset = (page - 1) * pageSize;
                const products = await this.productRepository.find({
                    where: { status: 'active' },
                    skip: offset,
                    take: pageSize,
                });

                if (products.length === 0) {
                    hasMore = false;
                    break;
                }

                // Transform products for Elasticsearch
                const productsForEs = products.map((product) => ({
                    id: product.id,
                    name: product.name,
                    description: product.description,
                    category: product.category,
                    price: parseFloat(product.price.toString()),
                    status: product.status,
                    created_at: product.createdAt,
                }));

                // Index batch
                await this.bulkIndexProducts(productsForEs);

                page++;
            }

            this.logger.log('Full product reindex completed');
        } catch (error) {
            this.logger.error(`Error during full reindex: ${error.message}`);
        }
    }

    async search(
        query: string,
        options: {
            page?: number;
            limit?: number;
            minPrice?: number;
            maxPrice?: number;
            brands?: string[];
            category?: string;
        } = {},
    ): Promise<{
        hits: any[];
        total: number;
    }> {
        const client = this.elasticsearchConfigService.getClient();
        const {
            page = 1,
            limit = 12,
            minPrice,
            maxPrice,
            brands,
            category,
        } = options;

        try {
            // Build Elasticsearch query
            const must: any[] = [];
            const filter: any[] = [];

            // Text search
            if (query && query.trim()) {
                must.push({
                    multi_match: {
                        query: query.trim(),
                        fields: ['name^3', 'description'],
                        fuzziness: 'AUTO',
                        operator: 'or',
                    },
                });
            }

            // Category filter
            if (category) {
                filter.push({ term: { category } });
            }

            // Price range filter
            if (minPrice !== undefined || maxPrice !== undefined) {
                const range: any = { price: {} };
                if (minPrice !== undefined) range.price.gte = minPrice;
                if (maxPrice !== undefined) range.price.lte = maxPrice;
                filter.push({ range });
            }

            // Brands filter
            if (brands && brands.length > 0) {
                filter.push({
                    terms: { 'specifications.manufacturer.keyword': brands },
                });
            }

            // Status filter - only active products
            filter.push({ term: { status: 'active' } });

            // Execute search
            const response = await client.search({
                index: this.indexName,
                body: {
                    from: (page - 1) * limit,
                    size: limit,
                    query: {
                        bool: {
                            must,
                            filter,
                        },
                    },
                    sort: [
                        { _score: { order: 'desc' } },
                        { created_at: { order: 'desc' } },
                    ],
                },
            });

            // Transform results
            const hits = response.hits.hits.map((hit) => ({
                id: hit._id,
                // Fix the spread operator by ensuring _source is treated as an object
                ...(hit._source as Record<string, any>),
                score: hit._score,
            }));

            return {
                hits,
                total:
                    typeof response.hits.total === 'number'
                        ? response.hits.total
                        : response.hits.total.value,
            };
        } catch (error) {
            this.logger.error(`Error searching products: ${error.message}`);
            return { hits: [], total: 0 };
        }
    }

    async getSuggestions(query: string): Promise<string[]> {
        if (!query || query.length < 2) return [];

        const client = this.elasticsearchConfigService.getClient();

        try {
            // First check if we have any products in the index
            const isEmpty = await this.isIndexEmpty();
            if (isEmpty) {
                this.logger.warn(
                    'Elasticsearch index is empty, no suggestions available',
                );
                return [];
            }

            // Use simple prefix query for suggestions if aggregations don't work well
            const response = await client.search({
                index: this.indexName,
                body: {
                    size: 5,
                    _source: ['name'],
                    query: {
                        bool: {
                            must: [
                                {
                                    prefix: {
                                        'name.keyword': {
                                            value: query,
                                            case_insensitive: true,
                                        },
                                    },
                                },
                            ],
                            filter: [{ term: { status: 'active' } }],
                        },
                    },
                },
            });

            // Extract suggestion names from results
            const suggestions = response.hits.hits.map(
                (hit) => (hit._source as any).name,
            );

            // If we get suggestions from simple query, return them
            if (suggestions.length > 0) {
                return suggestions;
            }

            // Fallback to aggregation method
            const aggResponse = await client.search({
                index: this.indexName,
                body: {
                    size: 0,
                    query: {
                        bool: {
                            should: [
                                {
                                    match_phrase_prefix: {
                                        name: {
                                            query: query,
                                            max_expansions: 10,
                                        },
                                    },
                                },
                                {
                                    fuzzy: {
                                        name: {
                                            value: query,
                                            fuzziness: 'AUTO',
                                        },
                                    },
                                },
                            ],
                            filter: [{ term: { status: 'active' } }],
                        },
                    },
                    aggs: {
                        suggestions: {
                            terms: {
                                field: 'name.keyword',
                                size: 5,
                            },
                        },
                    },
                },
            });

            // Extract from aggregations with a fallback
            return (
                (aggResponse.aggregations?.suggestions as any)?.buckets?.map(
                    (bucket: any) => bucket.key,
                ) || []
            );
        } catch (error) {
            this.logger.error(`Error getting suggestions: ${error.message}`);
            return [];
        }
    }

    async removeProduct(id: string): Promise<void> {
        const client = this.elasticsearchConfigService.getClient();
        try {
            await client.delete({
                index: this.indexName,
                id,
            });
            this.logger.log(`Deleted product ${id} from Elasticsearch index`);
        } catch (error) {
            this.logger.error(`Error deleting product ${id} from Elasticsearch: ${error.message}`);
            // Optionally rethrow or ignore if not found
        }
    }
}
