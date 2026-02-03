
import { ChromaClient } from 'chromadb';
import * as dotenv from 'dotenv';
dotenv.config();

const dummyEmbeddingFunction = {
    generate: async (texts: string[]) => {
        // console.log(`Generating dummy embeddings for ${texts.length} texts`);
        return texts.map(() => new Array(128).fill(0));
    }
};

async function fixGlobalNews() {
    console.log('--- FIXING GLOBAL NEWS COLLECTION ---');
    const host = process.env.CHROMA_HOST || '127.0.0.1';
    const port = process.env.CHROMA_PORT ? parseInt(process.env.CHROMA_PORT) : 8000;

    console.log(`Connecting to ${host}:${port}`);

    const client = new ChromaClient({ host, port });

    try {
        await client.heartbeat();
        console.log('✅ Connected to ChromaDB');
    } catch (e) {
        console.error('❌ Failed to connect to ChromaDB:', e);
        return;
    }

    // 1. Try to delete existing collection (corrupt or not)
    try {
        console.log('Attempting to delete existing global_news collection...');
        await client.deleteCollection({ name: 'global_news' });
        console.log('✅ Deleted existing global_news collection');
    } catch (e: any) {
        console.log('ℹ️ Delete failed (likely did not exist):', e.message);
    }

    // 2. Create fresh collection
    try {
        console.log('Creating fresh global_news collection...');
        const collection = await client.createCollection({
            name: 'global_news',
            embeddingFunction: dummyEmbeddingFunction,
            metadata: { description: 'Global news articles with categorization and tags' }
        });

        console.log('✅ Collection created successfully:', collection.name);

        // 3. Verify it works
        console.log('Verifying collection with a test document...');
        await collection.add({
            ids: ['init_check'],
            documents: ['System Initialization Check'],
            metadatas: [{ source: 'system', type: 'health_check' }]
        });
        console.log('✅ Verification add successful');

        console.log('\nSUCCESS: global_news collection is now valid and ready for the agent.');
        console.log('You can now restart the news agent service.');

    } catch (e) {
        console.error('❌ Operation failed:', e);
    }
}

fixGlobalNews();
