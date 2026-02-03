// Test script for Redis Message Bus
// Run this to verify Redis is working correctly

import messageBus, { Channel } from '../shared/message-bus';
import redisCache from '../shared/redis-cache';

async function testMessageBus() {
  console.log('Testing Redis Message Bus...\n');

  // Manually connect (not in production mode)
  console.log('Connecting to Redis...');
  await messageBus.connect();
  await redisCache.connect();
  console.log('Connected!\n');

  // Test connection
  const busStatus = messageBus.getStatus();
  const cacheStatus = redisCache.getStatus();
  console.log(`Message Bus Status: ${JSON.stringify(busStatus, null, 2)}`);
  console.log(`Cache Status: ${JSON.stringify(cacheStatus, null, 2)}\n`);

  // Test publish (we publish, but we filter our own messages - this tests the publish works)
  const publishResult = await messageBus.publish('test:channel', { hello: 'world', timestamp: Date.now() });
  console.log(`Publish test: ${publishResult ? 'PASS ✓' : 'FAIL ✗'}`);

  // Test subscribe by using EventEmitter (local subscribers work)
  let localReceived = false;
  messageBus.once('test:channel', () => { localReceived = true; });
  await messageBus.publish('test:channel', { test: 'local' });
  console.log(`Local emit test: ${localReceived ? 'PASS ✓' : 'FAIL ✗'}`);

  // Test cache
  await redisCache.set('test', 'key', { value: 42 });
  const cached = await redisCache.get('test', 'key');
  console.log(`Cache test: ${JSON.stringify(cached) === JSON.stringify({ value: 42 }) ? 'PASS ✓' : 'FAIL ✗'}`);

  // Test cache TTL convenience methods
  await redisCache.setLLMResponse('test prompt', 'gpt-4', { response: 'test response' });
  const llmCached = await redisCache.getLLMResponse('test prompt', 'gpt-4');
  console.log(`LLM Cache test: ${llmCached?.response === 'test response' ? 'PASS ✓' : 'FAIL ✗'}`);

  // Test embedding cache
  await redisCache.setEmbedding('test text', [0.1, 0.2, 0.3]);
  const embCached = await redisCache.getEmbedding('test text');
  console.log(`Embedding Cache test: ${JSON.stringify(embCached) === '[0.1,0.2,0.3]' ? 'PASS ✓' : 'FAIL ✗'}`);

  // Test channel enum
  console.log(`Channel enum test: ${Channel.NEWS_CLUSTERED === 'news:clustered' ? 'PASS ✓' : 'FAIL ✗'}`);

  // Test cache stats
  const stats = await redisCache.getStats('test');
  console.log(`Cache stats test: ${stats.totalKeys >= 0 ? 'PASS ✓' : 'FAIL ✗'}`);

  // Cleanup
  await redisCache.delete('test', 'key');

  await messageBus.disconnect();
  await redisCache.disconnect();

  console.log('\n✅ All tests complete!');
  process.exit(0);
}

testMessageBus().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
