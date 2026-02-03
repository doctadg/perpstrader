
import { ChromaClient } from 'chromadb';
import * as dotenv from 'dotenv';
dotenv.config();

const dummyEmbeddingFunction = {
    generate: async (texts: string[]) => {
        return texts.map(() => new Array(128).fill(0));
    }
};

async function testGetOrCreate() {
    console.log('--- TESTING getOrCreateCollection ---');
    const host = process.env.CHROMA_HOST || '127.0.0.1';
    const port = process.env.CHROMA_PORT ? parseInt(process.env.CHROMA_PORT) : 8000;

    const client = new ChromaClient({ host, port });

    try {
        console.log('Calling getOrCreateCollection...');
        const collection = await client.getOrCreateCollection({
            name: 'global_news',
            metadata: { description: 'Global news articles with categorization and tags' },
            embeddingFunction: dummyEmbeddingFunction
        });
        console.log('✅ getOrCreateCollection succeeded:', collection.name);
        console.log('Metadata:', collection.metadata);

        // Verify we can use it
        const count = await collection.count();
        console.log('Count:', count);

    } catch (e: any) {
        console.error('❌ getOrCreateCollection failed:', e);
    }
}

testGetOrCreate();
