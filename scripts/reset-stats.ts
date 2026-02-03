
import '../src/polyfills';
import 'dotenv/config';
import dataManager from '../src/data-manager/data-manager';

async function main() {
    console.log('Resetting trading statistics...');

    try {
        const count = await dataManager.clearAllTrades();
        console.log(`Successfully cleared ${count} trades.`);
        console.log('Realized PnL has been reset to 0.');
    } catch (error) {
        console.error('Failed to reset stats:', error);
        process.exit(1);
    }
}

main();
