import dotenv from 'dotenv';
import { clientSyncService } from '../services/clientSync';

// Load environment variables
dotenv.config();

async function testDeleteWebhook() {
  console.log('🧪 Testing Notion delete webhook...\n');

  // Test 1: Simulate deleting "Not a client" (the one we created earlier)
  const deleteWebhook = {
    type: 'page.deleted',
    entity: {
      id: '23f9a8ee-e622-8025-aea7-e3f3c596e8dc',
      type: 'page'
    },
    workspace_id: 'b959a8ee-e622-81e9-b6de-0003cb7ce8f4',
    workspace_name: 'Asera',
    subscription_id: '23fd872b-594c-811b-9afd-009971d70c33',
    integration_id: '218d872b-594c-8034-b79a-003771992eac',
    timestamp: new Date().toISOString()
  };

  console.log('📤 Sending delete webhook for "Not a client"...');
  const result = await clientSyncService.handleWebhook(deleteWebhook);
  
  console.log('📥 Response:', result);
  console.log('\n✅ Delete webhook test completed!');
}

// Run the test
testDeleteWebhook().catch(console.error); 