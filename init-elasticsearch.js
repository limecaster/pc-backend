#!/usr/bin/env node
/**
 * This script initializes Elasticsearch with product data
 * Run with: node init-elasticsearch.js
 */
const axios = require('axios');

async function initializeElasticsearchData() {
    console.log('Starting Elasticsearch initialization...');

    try {
        // Call the reindex endpoint to populate Elasticsearch
        const response = await axios.post(
            'http://localhost:3001/products/reindex',
        );

        console.log('Elasticsearch initialization response:', response.data);
        console.log('Elasticsearch initialization complete!');

        console.log('\nYou can now use search and autocomplete features.');
    } catch (error) {
        console.error('Error initializing Elasticsearch:');
        console.error(error.response?.data || error.message);
        console.error('\nPlease ensure:');
        console.error('1. The backend server is running');
        console.error('2. Elasticsearch is running and configured correctly');
        console.error('3. There are products in the database');
    }
}

initializeElasticsearchData();
