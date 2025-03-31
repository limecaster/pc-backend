/**
 * Script to call the image migration API
 *
 * Usage:
 * 1. Make sure your NestJS application is running
 * 2. Set your admin JWT token below
 * 3. Run this script with: ts-node scripts/migrate-images.ts
 */

import axios from 'axios';

// Set your admin JWT token here
const ADMIN_TOKEN = 'YOUR_ADMIN_JWT_TOKEN_HERE';
// Set your API URL here
const API_URL = 'http://localhost:3001'; // Update to match your actual backend URL

async function migrateImages() {
    console.log('Starting image migration process...');

    try {
        const response = await axios.post(
            `${API_URL}/products/admin/migrate-images`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${ADMIN_TOKEN}`,
                },
            },
        );

        console.log('Migration completed successfully');
        console.log('Results:', response.data);
    } catch (error) {
        console.error(
            'Error during migration:',
            error.response?.data || error.message,
        );
    }
}

migrateImages();
