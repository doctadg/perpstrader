#!/usr/bin/env node
/**
 * Check Arbitrum Blockchain Directly via API
 */

const ADDRESS = '0xA72d98271e2C39E88738711E8B4d540627F5c047';

async function checkArbiscan() {
    console.log('='.repeat(70));
    console.log('ARBITRUM BLOCKCHAIN CHECK');
    console.log('='.repeat(70));
    console.log(`Address: ${ADDRESS}`);
    console.log('');

    // Try to get balance from public Arbitrum RPC
    const rpcUrls = [
        'https://arb1.arbitrum.io/rpc',
        'https://arbitrum.llamarpc.com',
        'https://arb-pokt.nodies.app'
    ];

    const USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
    
    for (const rpcUrl of rpcUrls) {
        try {
            console.log(`Trying ${rpcUrl}...`);
            
            // Get ETH balance
            const ethResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_getBalance',
                    params: [ADDRESS, 'latest']
                })
            });
            
            const ethData = await ethResponse.json();
            if (ethData.result) {
                const ethBalance = BigInt(ethData.result);
                console.log(`ETH Balance: ${Number(ethBalance) / 1e18} ETH`);
            }

            // Get USDC balance
            const usdcResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'eth_call',
                    params: [{
                        to: USDC_ARB,
                        data: `0x70a08231000000000000000000000000${ADDRESS.slice(2)}`
                    }, 'latest']
                })
            });

            const usdcData = await usdcResponse.json();
            if (usdcData.result && usdcData.result !== '0x') {
                const usdcBalance = BigInt(usdcData.result);
                console.log(`USDC Balance: ${Number(usdcBalance) / 1e6} USDC`);
            }

            // Get transaction count
            const nonceResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 3,
                    method: 'eth_getTransactionCount',
                    params: [ADDRESS, 'latest']
                })
            });

            const nonceData = await nonceResponse.json();
            if (nonceData.result) {
                const nonce = BigInt(nonceData.result);
                console.log(`Transaction Count: ${Number(nonce)}`);
            }

            console.log('✓ Success');
            break;
        } catch (error) {
            console.log(`✗ Failed: ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(70));
}

checkArbiscan();