
import { ChromaClient } from 'chromadb';
import * as dotenv from 'dotenv';
dotenv.config();

const dummyEmbeddingFunction = {
    generate: async (texts: string[]) => {
        console.log(`Generating dummy embeddings for ${texts.length} texts`);
        return texts.map(() => new Array(128).fill(0));
    }
};

async function testChroma() {
    console.log('Testing ChromaDB Connection...');
    const host = process.env.CHROMA_HOST || '127.0.0.1';
    const port = process.env.CHROMA_PORT ? parseInt(process.env.CHROMA_PORT) : 8000;

    console.log(`Connecting to ${host}:${port}`);

    const client = new ChromaClient({ host, port });

    try {
        const heartbeat = await client.heartbeat();
        console.log('Heartbeat:', heartbeat);
    } catch (e) {
        console.error('Failed to connect to ChromaDB:', e);
        return;
    }

    try {
        console.log('Attempting to get or create collection...');

        // specialized handling for existing collection
        try {
            await client.deleteCollection({ name: 'test_collection' });
            console.log('Deleted old test collection');
        } catch (e) { }

        const collection = await client.createCollection({
            name: 'test_collection',
            embeddingFunction: dummyEmbeddingFunction,
            metadata: { description: 'Test collection' }
        });

        console.log('Collection created successfully:', collection);

        console.log('Testing add...');
        await collection.add({
            ids: ['test1'],
            documents: ['This is a test document'],
            metadatas: [{ source: 'test' }]
        });
        console.log('Add successful');

        console.log('Testing query...');
        const results = await collection.query({
            queryTexts: ['test'],
            nResults: 1
        });
        console.log('Query results:', results);

        // Clean up
        await client.deleteCollection({ name: 'test_collection' });
        console.log('Test collection deleted. Test Passed!');

    } catch (e) {
        console.error('Operation failed:', e);
        if (e instanceof Error) {
            console.error('Error message:', e.message);
            console.error('Error stack:', e.stack);
        }
        // Print full error object just in case
        console.error('Full error:', JSON.stringify(e, null, 2));
    }
}

testChroma();
