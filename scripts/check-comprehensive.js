#!/usr/bin/env node
/**
 * Hyperliquid Comprehensive Account Check
 * 
 * Checks multiple account locations for funds.
 */

require('dotenv').config();
const { PublicClient, HttpTransport } = require('@nktkas/hyperliquid');

// Configuration
const WALLET_ADDRESS = process.env.HYPERLIQUID_MAIN_ADDRESS || '0xA72d98271e2C39E88738711E8B4d540627F5c047';
const IS_TESTNET = false;

async function main() {
    console.log('='.repeat(70));
    console.log('HYPERLIQUID COMPREHENSIVE ACCOUNT CHECK');
    console.log('='.repeat(70));
    console.log(`Address: ${WALLET_ADDRESS}`);
    console.log('='.repeat(70));

    const transport = new HttpTransport({ isTestnet: IS_TESTNET, timeout: 30000 });
    const publicClient = new PublicClient({ transport });

    // 1. Check Clearinghouse State (Perps Account)
    console.log('\n--- 1. Perpetual Futures Account ---');
    try {
        const state = await publicClient.clearinghouseState({ user: WALLET_ADDRESS });
        console.log('Raw Response:');
        console.log(JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // 2. Check Spot Token Balances
    console.log('\n--- 2. Spot Token Balances ---');
    try {
        const spotBalances = await publicClient.spotTokenBalances({ user: WALLET_ADDRESS });
        console.log('Spot Balances:');
        console.log(JSON.stringify(spotBalances, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // 3. Check Vaults
    console.log('\n--- 3. User Vaults ---');
    try {
        const vaults = await publicClient.userVaults({ user: WALLET_ADDRESS });
        console.log('Vaults:');
        console.log(JSON.stringify(vaults, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // 4. Check Vault Details
    console.log('\n--- 4. Vault Details (if any) ---');
    try {
        // Try checking if the address itself is a vault
        const vaultDetails = await publicClient.vaultDetails({ vaultAddress: WALLET_ADDRESS });
        console.log('Vault Details:');
        console.log(JSON.stringify(vaultDetails, null, 2));
    } catch (error) {
        console.error('Error (expected if not a vault):', error.message);
    }

    // 5. Check Delegations
    console.log('\n--- 5. Delegations ---');
    try {
        const delegations = await publicClient.delegations({ user: WALLET_ADDRESS });
        console.log('Delegations:');
        console.log(JSON.stringify(delegations, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // 6. Check Rewards
    console.log('\n--- 6. Rewards Summary ---');
    try {
        const rewards = await publicClient.rewardsSummary({ user: WALLET_ADDRESS });
        console.log('Rewards:');
        console.log(JSON.stringify(rewards, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // 7. Check Funding History
    console.log('\n--- 7. Funding History (recent) ---');
    try {
        const funding = await publicClient.fundingHistory({ 
            user: WALLET_ADDRESS,
            startTime: Date.now() - 30 * 24 * 60 * 60 * 1000 // 30 days ago
        });
        console.log('Recent funding payments:');
        console.log(JSON.stringify(funding.slice(0, 5), null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    console.log('\n' + '='.repeat(70));
    console.log('CHECK COMPLETE');
    console.log('='.repeat(70));
}

main().catch(console.error);