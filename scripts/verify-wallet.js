#!/usr/bin/env node
/**
 * Verify Wallet and Check Arbitrum Balance
 */

require('dotenv').config();
const { privateKeyToAccount } = require('viem/accounts');
const { createPublicClient, http, formatEther, formatUnits } = require('viem');
const { arbitrum } = require('viem/chains');

const PRIVATE_KEY = process.env.HYPERLIQUID_PRIVATE_KEY || '0xfa0f031555db618d9ece53fe32e5a4fba54fbb794b3cb2396adfd73df9722bf6';
const EXPECTED_ADDRESS = process.env.HYPERLIQUID_MAIN_ADDRESS || '0xA72d98271e2C39E88738711E8B4d540627F5c047';

async function main() {
    console.log('='.repeat(70));
    console.log('WALLET VERIFICATION');
    console.log('='.repeat(70));

    // Verify private key matches address
    console.log('\n--- Private Key Verification ---');
    let wallet;
    try {
        wallet = privateKeyToAccount(PRIVATE_KEY);
        console.log(`Derived Address:    ${wallet.address}`);
        console.log(`Expected Address:   ${EXPECTED_ADDRESS}`);
        
        if (wallet.address.toLowerCase() === EXPECTED_ADDRESS.toLowerCase()) {
            console.log('✓ Address MATCHES private key');
        } else {
            console.log('✗ ADDRESS MISMATCH!');
            console.log('  The private key does NOT match the expected address.');
            console.log('  Funds may be at the DERIVED address.');
        }
    } catch (error) {
        console.error('✗ Invalid private key:', error.message);
        return;
    }

    // Check Arbitrum balance
    console.log('\n--- Arbitrum L1 Balance ---');
    const client = createPublicClient({
        chain: arbitrum,
        transport: http()
    });

    try {
        // ETH Balance
        const ethBalance = await client.getBalance({ address: wallet.address });
        console.log(`ETH Balance: ${formatEther(ethBalance)} ETH`);

        // Check USDC balance (USDC on Arbitrum)
        const USDC_CONTRACT = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC
        
        const usdcBalance = await client.readContract({
            address: USDC_CONTRACT,
            abi: [{
                "constant": true,
                "inputs": [{"name": "_owner", "type": "address"}],
                "name": "balanceOf",
                "outputs": [{"name": "balance", "type": "uint256"}],
                "type": "function"
            }],
            functionName: 'balanceOf',
            args: [wallet.address]
        });
        
        console.log(`USDC Balance: ${formatUnits(usdcBalance, 6)} USDC`);

        // Also check USDC.e (Bridged USDC)
        const USDCE_CONTRACT = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
        try {
            const usdceBalance = await client.readContract({
                address: USDCE_CONTRACT,
                abi: [{
                    "constant": true,
                    "inputs": [{"name": "_owner", "type": "address"}],
                    "name": "balanceOf",
                    "outputs": [{"name": "balance", "type": "uint256"}],
                    "type": "function"
                }],
                functionName: 'balanceOf',
                args: [wallet.address]
            });
            console.log(`USDC.e Balance: ${formatUnits(usdceBalance, 6)} USDC.e`);
        } catch (e) {
            console.log('USDC.e Balance: Unable to fetch');
        }

    } catch (error) {
        console.error('Error fetching Arbitrum balances:', error.message);
    }

    // Check if derived address is different and check that too
    if (wallet.address.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
        console.log(`\n--- Checking Expected Address (${EXPECTED_ADDRESS}) ---`);
        try {
            const ethBalance = await client.getBalance({ address: EXPECTED_ADDRESS });
            console.log(`ETH Balance: ${formatEther(ethBalance)} ETH`);

            const USDC_CONTRACT = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
            const usdcBalance = await client.readContract({
                address: USDC_CONTRACT,
                abi: [{
                    "constant": true,
                    "inputs": [{"name": "_owner", "type": "address"}],
                    "name": "balanceOf",
                    "outputs": [{"name": "balance", "type": "uint256"}],
                    "type": "function"
                }],
                functionName: 'balanceOf',
                args: [EXPECTED_ADDRESS]
            });
            console.log(`USDC Balance: ${formatUnits(usdcBalance, 6)} USDC`);
        } catch (error) {
            console.error('Error:', error.message);
        }
    }

    console.log('\n' + '='.repeat(70));
}

main().catch(console.error);