
import { ChromaClient } from 'chromadb';
import * as dotenv from 'dotenv';
dotenv.config();

const dummyEmbeddingFunction = {
    generate: async (texts: string[]) => {
        const dim = Number.parseInt(process.env.NEWS_EMBEDDING_DIM || '64', 10) || 64;
        return texts.map(() => new Array(dim).fill(0));
    },
};

async function verifyChroma() {
    console.log('--- VERIFYING GLOBAL NEWS COLLECTION ---');
    const host = process.env.CHROMA_HOST || '127.0.0.1';
    const port = process.env.CHROMA_PORT ? parseInt(process.env.CHROMA_PORT) : 8000;
    const dim = Number.parseInt(process.env.NEWS_EMBEDDING_DIM || '64', 10) || 64;
    const collectionName = process.env.CHROMA_NEWS_COLLECTION || `global_news_local_${dim}`;

    console.log(`Connecting to ${host}:${port}`);
    const client = new ChromaClient({ host, port });

    try {
        console.log('Attempting getCollection...');
        const collection = await client.getCollection({
            name: collectionName,
            embeddingFunction: dummyEmbeddingFunction
        });
        console.log('✅ getCollection succeeded:', collection.name);
        console.log('Metadata:', collection.metadata);

        const count = await collection.count();
        console.log('Count:', count);

    } catch (e: any) {
        console.error('❌ getCollection failed:', e);
        console.error('Error name:', e.name);
        console.error('Error message:', e.message);
    }
}

verifyChroma();
