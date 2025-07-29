import { Client } from '@notionhq/client';
import { logger } from '../utils/logger';

// Initialize Notion client
const notion = new Client({ 
  auth: process.env.NOTION_API_KEY 
});

const databaseId = '20f9a8eee622805ea2ecd18f3d424818';

async function inspectDatabase() {
  try {
    console.log('🔍 Inspecting Notion Database Structure...\n');

    // Get database info
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });

    console.log('📋 Database Info:');
    const title = 'title' in database && database.title ? 
      (database.title as any)[0]?.plain_text || 'Untitled' : 
      'Untitled';
    console.log(`   Name: ${title}`);
    console.log(`   ID: ${database.id}`);
    console.log(`   Properties: ${Object.keys(database.properties).length}\n`);

    // List all properties
    console.log('🏷️  Database Properties:');
    Object.entries(database.properties).forEach(([key, value]) => {
      console.log(`   ${key}: ${(value as any).type}`);
    });

    // Get a few pages to see their structure
    console.log('\n📄 Sample Pages:');
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 3,
    });

    response.results.forEach((page, index) => {
      if (page.object === 'page' && 'properties' in page) {
        console.log(`\n   Page ${index + 1}:`);
        console.log(`   ID: ${page.id}`);
        
        // Show properties
        Object.entries(page.properties).forEach(([key, value]) => {
          const prop = value as any;
          let content = '';
          
          switch (prop.type) {
            case 'title':
              content = prop.title?.map((t: any) => t.plain_text).join(' ') || '';
              break;
            case 'rich_text':
              content = prop.rich_text?.map((t: any) => t.plain_text).join(' ') || '';
              break;
            case 'email':
              content = prop.email || '';
              break;
            case 'select':
              content = prop.select?.name || '';
              break;
            case 'multi_select':
              content = prop.multi_select?.map((s: any) => s.name).join(', ') || '';
              break;
            default:
              content = `[${prop.type}]`;
          }
          
          console.log(`     ${key} (${prop.type}): ${content}`);
        });
      }
    });

    console.log('\n✅ Database inspection completed!');

  } catch (error) {
    console.error('❌ Error inspecting database:', error);
  }
}

// Run the script
if (require.main === module) {
  inspectDatabase()
    .then(() => {
      console.log('Inspection completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Inspection failed:', error);
      process.exit(1);
    });
}

export { inspectDatabase }; 