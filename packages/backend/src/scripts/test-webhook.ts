import { clientSyncService } from '../services/clientSync';
import { logger } from '../utils/logger';

/**
 * Test webhook functionality
 */
async function testWebhook() {
  try {
    logger.info('Testing webhook functionality...');

    // Test 1: Simulate a page.updated webhook
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

    logger.info('Testing page.updated webhook...');
    const updateResult = await clientSyncService.handleWebhook(updateWebhook);
    logger.info('Update webhook result:', updateResult);

    // Test 2: Simulate a page.created webhook
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

    logger.info('Testing page.created webhook...');
    const createResult = await clientSyncService.handleWebhook(createWebhook);
    logger.info('Create webhook result:', createResult);

    // Test 3: Test with invalid data
    const invalidWebhook = {
      type: 'page.updated',
      page: null
    };

    logger.info('Testing invalid webhook...');
    const invalidResult = await clientSyncService.handleWebhook(invalidWebhook);
    logger.info('Invalid webhook result:', invalidResult);

    logger.info('Webhook tests completed successfully!');

  } catch (error) {
    logger.error('Webhook test failed:', { error });
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

export { testWebhook }; 