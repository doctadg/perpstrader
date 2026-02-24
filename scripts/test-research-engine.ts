// Test script for Research Engine

import researchEngine from '../src/research-engine';
import logger from '../src/shared/logger';

async function testResearchEngine() {
  logger.info('=== Testing Research Engine ===');

  try {
    // Initialize
    logger.info('Starting research engine...');
    await researchEngine.start();

    // Get initial status
    const status = await researchEngine.getStatus();
    logger.info('Research Engine Status:', status);

    // Run one research cycle manually
    logger.info('Running research cycle...');
    await researchEngine.runResearchCycle();

    // Get updated status
    const updatedStatus = await researchEngine.getStatus();
    logger.info('Updated Status:', updatedStatus);

    // Get pending ideas
    const pendingIdeas = await researchEngine.getPendingIdeas(5);
    logger.info(`Pending ideas: ${pendingIdeas.length}`);
    pendingIdeas.forEach((idea, i) => {
      logger.info(`  ${i + 1}. ${idea.name} (${idea.type}, confidence: ${idea.confidence.toFixed(2)})`);
    });

    // Stop the engine
    researchEngine.stop();
    logger.info('=== Research Engine Test Complete ===');

  } catch (error) {
    logger.error('Test failed:', error);
    researchEngine.stop();
    process.exit(1);
  }
}

testResearchEngine();
