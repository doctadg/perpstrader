"use strict";
// Test script for Redis Message Bus
// Run this to verify Redis is working correctly
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const message_bus_1 = __importStar(require("../shared/message-bus"));
const redis_cache_1 = __importDefault(require("../shared/redis-cache"));
async function testMessageBus() {
    console.log('Testing Redis Message Bus...\n');
    // Manually connect (not in production mode)
    console.log('Connecting to Redis...');
    await message_bus_1.default.connect();
    await redis_cache_1.default.connect();
    console.log('Connected!\n');
    // Test connection
    const busStatus = message_bus_1.default.getStatus();
    const cacheStatus = redis_cache_1.default.getStatus();
    console.log(`Message Bus Status: ${JSON.stringify(busStatus, null, 2)}`);
    console.log(`Cache Status: ${JSON.stringify(cacheStatus, null, 2)}\n`);
    // Test publish (we publish, but we filter our own messages - this tests the publish works)
    const publishResult = await message_bus_1.default.publish('test:channel', { hello: 'world', timestamp: Date.now() });
    console.log(`Publish test: ${publishResult ? 'PASS ✓' : 'FAIL ✗'}`);
    // Test subscribe by using EventEmitter (local subscribers work)
    let localReceived = false;
    message_bus_1.default.once('test:channel', () => { localReceived = true; });
    await message_bus_1.default.publish('test:channel', { test: 'local' });
    console.log(`Local emit test: ${localReceived ? 'PASS ✓' : 'FAIL ✗'}`);
    // Test cache
    await redis_cache_1.default.set('test', 'key', { value: 42 });
    const cached = await redis_cache_1.default.get('test', 'key');
    console.log(`Cache test: ${JSON.stringify(cached) === JSON.stringify({ value: 42 }) ? 'PASS ✓' : 'FAIL ✗'}`);
    // Test cache TTL convenience methods
    await redis_cache_1.default.setLLMResponse('test prompt', 'gpt-4', { response: 'test response' });
    const llmCached = await redis_cache_1.default.getLLMResponse('test prompt', 'gpt-4');
    console.log(`LLM Cache test: ${llmCached?.response === 'test response' ? 'PASS ✓' : 'FAIL ✗'}`);
    // Test embedding cache
    await redis_cache_1.default.setEmbedding('test text', [0.1, 0.2, 0.3]);
    const embCached = await redis_cache_1.default.getEmbedding('test text');
    console.log(`Embedding Cache test: ${JSON.stringify(embCached) === '[0.1,0.2,0.3]' ? 'PASS ✓' : 'FAIL ✗'}`);
    // Test channel enum
    console.log(`Channel enum test: ${message_bus_1.Channel.NEWS_CLUSTERED === 'news:clustered' ? 'PASS ✓' : 'FAIL ✗'}`);
    // Test cache stats
    const stats = await redis_cache_1.default.getStats('test');
    console.log(`Cache stats test: ${stats.totalKeys >= 0 ? 'PASS ✓' : 'FAIL ✗'}`);
    // Cleanup
    await redis_cache_1.default.delete('test', 'key');
    await message_bus_1.default.disconnect();
    await redis_cache_1.default.disconnect();
    console.log('\n✅ All tests complete!');
    process.exit(0);
}
testMessageBus().catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
});
//# sourceMappingURL=test-redis.js.map