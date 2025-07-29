"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const clientSync_1 = require("../services/clientSync");
// Load environment variables
dotenv_1.default.config();
async function testDatabaseFilter() {
    console.log('🧪 Testing database filtering for webhooks...\n');
    // Test 1: Simulate a webhook from a different database (should be ignored)
    const differentDatabaseWebhook = {
        type: 'page.created',
        page: {
            id: 'test-page-id-123',
            object: 'page',
            parent: {
                type: 'database_id',
                database_id: 'different-database-id-456' // Different from clients database
            },
            properties: {
                Name: {
                    type: 'title',
                    title: [{ plain_text: 'Test Non-Client Page' }]
                }
            }
        },
        workspace_id: 'b959a8ee-e622-81e9-b6de-0003cb7ce8f4',
        workspace_name: 'Asera',
        subscription_id: '23fd872b-594c-811b-9afd-009971d70c33',
        integration_id: '218d872b-594c-8034-b79a-003771992eac',
        timestamp: new Date().toISOString()
    };
    console.log('📤 Sending webhook from different database...');
    const result1 = await clientSync_1.clientSyncService.handleWebhook(differentDatabaseWebhook);
    console.log('📥 Response:', result1);
    console.log('✅ Expected: Should be ignored\n');
    // Test 2: Simulate a webhook from the correct clients database (should be processed)
    const correctDatabaseWebhook = {
        type: 'page.created',
        page: {
            id: 'test-client-page-789',
            object: 'page',
            parent: {
                type: 'database_id',
                database_id: '20f9a8eee622805ea2ecd18f3d424818' // Correct clients database ID
            },
            properties: {
                Name: {
                    type: 'title',
                    title: [{ plain_text: 'Test Client Page' }]
                }
            }
        },
        workspace_id: 'b959a8ee-e622-81e9-b6de-0003cb7ce8f4',
        workspace_name: 'Asera',
        subscription_id: '23fd872b-594c-811b-9afd-009971d70c33',
        integration_id: '218d872b-594c-8034-b79a-003771992eac',
        timestamp: new Date().toISOString()
    };
    console.log('📤 Sending webhook from correct clients database...');
    const result2 = await clientSync_1.clientSyncService.handleWebhook(correctDatabaseWebhook);
    console.log('📥 Response:', result2);
    console.log('✅ Expected: Should be processed\n');
    // Test 3: Simulate a content_updated webhook from different database
    const contentUpdatedDifferentDb = {
        type: 'page.content_updated',
        entity: {
            id: 'test-content-page-456',
            type: 'page'
        },
        data: {
            parent: {
                id: 'different-database-id-789',
                type: 'database'
            }
        },
        workspace_id: 'b959a8ee-e622-81e9-b6de-0003cb7ce8f4',
        workspace_name: 'Asera',
        subscription_id: '23fd872b-594c-811b-9afd-009971d70c33',
        integration_id: '218d872b-594c-8034-b79a-003771992eac',
        timestamp: new Date().toISOString()
    };
    console.log('📤 Sending content_updated webhook from different database...');
    const result3 = await clientSync_1.clientSyncService.handleWebhook(contentUpdatedDifferentDb);
    console.log('📥 Response:', result3);
    console.log('✅ Expected: Should be ignored\n');
    console.log('🎉 Database filtering test completed!');
}
// Run the test
testDatabaseFilter().catch(console.error);
