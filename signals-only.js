#!/usr/bin/env node

// Signals-only mode - Focus on GLM 4.6 signal generation
const glmService = require('./bin/agent-core/glm-service.js');
const dataManager = require('./bin/data-manager/data-manager.js');
const config = require('./bin/shared/config.js');
const logger = require('./bin/shared/logger.js');

class SignalsGenerator {
  constructor() {
    this.isRunning = false;
    this.signalsInterval = null;
  }

  async start() {
    try {
      console.log('🤖 Starting GLM 4.6 Signals Generator...');
      console.log('📍 Local Network Access: http://192.168.1.70:3000');
      console.log('');
      
      this.isRunning = true;

      // Check GLM availability
      const glmAvailable = await glmService.default.isAvailable();
      if (glmAvailable) {
        console.log('✅ GLM 4.6 service is available and ready!');
      } else {
        console.log('⚠️  GLM 4.6 service not available, using fallback mode');
      }

      // Generate signals every 2 minutes
      this.signalsInterval = setInterval(async () => {
        try {
          await this.generateSignalsCycle();
        } catch (error) {
          console.error('Signals cycle failed:', error);
        }
      }, 2 * 60 * 1000); // 2 minutes

      // Run initial cycle
      await this.generateSignalsCycle();

      console.log('🎯 Signals generator started successfully!');
      console.log('📊 Dashboard: http://192.168.1.70:3000');
      console.log('🔄 Signals generated every 2 minutes');
      console.log('⚠️  Press Ctrl+C to stop');

    } catch (error) {
      console.error('Failed to start signals generator:', error);
      process.exit(1);
    }
  }

  async stop() {
    console.log('🛑 Stopping signals generator...');
    this.isRunning = false;

    if (this.signalsInterval) {
      clearInterval(this.signalsInterval);
      this.signalsInterval = null;
    }

    console.log('✅ Signals generator stopped');
  }

  async generateSignalsCycle() {
    try {
      console.log(`\n🔄 ${new Date().toLocaleTimeString()} - Generating new signals...`);

      // Get mock market data (in real implementation, this would come from exchange)
      const mockMarketData = this.generateMockMarketData();
      
      // Get active strategies (empty for now, but GLM can work with this)
      const activeStrategies = [];

      // Generate signals using GLM 4.6
      const signals = await glmService.default.generateTradingSignal(mockMarketData, activeStrategies);
      
      if (signals.length > 0) {
        console.log(`📈 Generated ${signals.length} trading signals:`);
        signals.forEach((signal, index) => {
          const confidence = Math.round(signal.confidence * 100);
          const action = signal.action === 'HOLD' ? '⏸️  HOLD' : 
                        signal.action === 'BUY' ? '🟢 BUY' : '🔴 SELL';
          
          console.log(`  ${index + 1}. ${action} ${signal.symbol} | Confidence: ${confidence}% | Reason: ${signal.reason}`);
        });

        // Save signals to database
        for (const signal of signals) {
          await dataManager.default.saveTrade({
            id: signal.id,
            strategyId: signal.strategyId || 'glm-signals',
            symbol: signal.symbol,
            side: signal.action,
            size: signal.size,
            price: 0, // Would be filled by actual execution
            fee: 0,
            pnl: 0,
            timestamp: signal.timestamp,
            type: signal.type,
            status: 'SIGNAL', // Custom status for signals
            entryExit: 'SIGNAL'
          });
        }

        console.log(`💾 ${signals.length} signals saved to database`);
      } else {
        console.log('⏸️  No clear signals generated - market conditions uncertain');
      }

      // Generate market sentiment analysis
      try {
        const sentiment = await glmService.default.analyzeMarketSentiment('BTC', mockMarketData);
        console.log(`🧠 Market Sentiment: ${sentiment.description.substring(0, 100)}...`);
        console.log(`   Confidence: ${Math.round(sentiment.confidence * 100)}%`);
        
        // Save sentiment as insight
        await dataManager.default.saveAIInsight(sentiment);
      } catch (sentimentError) {
        console.log('⚠️  Sentiment analysis failed:', sentimentError.message);
      }

      console.log(`✅ Cycle completed at ${new Date().toLocaleTimeString()}\n`);

    } catch (error) {
      console.error('Signals cycle error:', error);
    }
  }

  generateMockMarketData() {
    // Generate realistic-looking mock market data
    const basePrice = 45000 + Math.random() * 5000; // BTC price range
    const data = [];
    
    for (let i = 0; i < 100; i++) {
      const variation = (Math.random() - 0.5) * 1000; // ±$500 variation
      const price = basePrice + variation;
      const volume = 1000000 + Math.random() * 500000;
      
      data.push({
        symbol: 'BTC',
        timestamp: new Date(Date.now() - (99 - i) * 60000), // Going back in time
        open: price,
        high: price + Math.random() * 100,
        low: price - Math.random() * 100,
        close: price + (Math.random() - 0.5) * 50,
        volume: volume
      });
    }
    
    return data;
  }
}

// Start signals generator if this file is run directly
if (require.main === module) {
  const signalsGenerator = new SignalsGenerator();
  
  signalsGenerator.start().catch((error) => {
    console.error('Failed to start signals generator:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received interrupt signal...');
    await signalsGenerator.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received termination signal...');
    await signalsGenerator.stop();
    process.exit(0);
  });
}

module.exports = SignalsGenerator;