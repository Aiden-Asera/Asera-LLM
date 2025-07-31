"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testWebhook = testWebhook;
const clientSync_1 = require("../services/clientSync");
const logger_1 = require("../utils/logger");
/**
 * Test webhook functionality
 */
async function testWebhook() {
    try {
        logger_1.logger.info('Testing webhook functionality...');
        // Test 1: Simulate Notion verification request
        const verificationWebhook = {
            verification_token: 'test-verification-token-123'
        };
        logger_1.logger.info('Testing Notion verification webhook...');
        const verificationResult = await clientSync_1.clientSyncService.handleWebhook(verificationWebhook);
        logger_1.logger.info('Verification webhook result:', verificationResult);
        // Test 2: Simulate a page.updated webhook
        const updateWebhook = {
            type: 'page.updated',
            page: {
                id: 'test-page-id',
                object: 'page',
                properties: {
                    Name: {
                        type: 'title',
                        title: [{ plain_text: 'Test Client' }]
                    }
                },
                last_edited_time: new Date().toISOString()
            }
        };
        logger_1.logger.info('Testing page.updated webhook...');
        const updateResult = await clientSync_1.clientSyncService.handleWebhook(updateWebhook);
        logger_1.logger.info('Update webhook result:', updateResult);
        // Test 3: Simulate a page.created webhook
        const createWebhook = {
            type: 'page.created',
            page: {
                id: 'new-page-id',
                object: 'page',
                properties: {
                    Name: {
                        type: 'title',
                        title: [{ plain_text: 'New Test Client' }]
                    }
                },
                last_edited_time: new Date().toISOString()
            }
        };
        logger_1.logger.info('Testing page.created webhook...');
        const createResult = await clientSync_1.clientSyncService.handleWebhook(createWebhook);
        logger_1.logger.info('Create webhook result:', createResult);
        // Test 4: Test with invalid data
        const invalidWebhook = {
            type: 'page.updated',
            page: null
        };
        logger_1.logger.info('Testing invalid webhook...');
        const invalidResult = await clientSync_1.clientSyncService.handleWebhook(invalidWebhook);
        logger_1.logger.info('Invalid webhook result:', invalidResult);
        // Test 5: Test ping webhook
        const pingWebhook = {
            type: 'ping'
        };
        logger_1.logger.info('Testing ping webhook...');
        const pingResult = await clientSync_1.clientSyncService.handleWebhook(pingWebhook);
        logger_1.logger.info('Ping webhook result:', pingResult);
        logger_1.logger.info('Webhook tests completed successfully!');
    }
    catch (error) {
        logger_1.logger.error('Webhook test failed:', { error });
    }
}
// Run the test if called directly
if (require.main === module) {
    testWebhook()
        .then(() => {
        console.log('Webhook tests completed');
        process.exit(0);
    })
        .catch((error) => {
        console.error('Webhook tests failed:', error);
        process.exit(1);
    });
}
