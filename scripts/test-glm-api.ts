#!/usr/bin/env npx tsx
// GLM API Debug & Test Script
// Tests GLM API connectivity and builds a robust classification system

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GLM_API_KEY = process.env.OPENROUTER_API_KEY || '';
const GLM_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const LABELING_MODEL = process.env.OPENROUTER_LABELING_MODEL || 'z-ai/glm-4.7-flash';
const MAIN_MODEL = process.env.OPENROUTER_LABELING_MODEL || 'z-ai/glm-4.7-flash';

const TEST_HEADLINES = [
    'US seizes two tankers linked to Venezuela and Russia',
    'Bitcoin breaks $100K milestone for first time ever',
    'Ethereum hack drains $50M from major DeFi protocol',
    'Fed signals rate cuts coming in 2026',
    'Brentford vs Sunderland prediction and picks',
    'MicroStrategy announces $2B more Bitcoin purchase',
    'SEC approves spot Ethereum ETF applications',
    'Oil prices plunge 5% on demand concerns',
    'ServiceNow Q4 earnings beat estimates by 15%',
    'Trump says Venezuela will start sending oil to US',
];

interface ClassificationResult {
    headline: string;
    topic: string;
    subEventType: string;
    trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
    urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    keywords: string[];
    success: boolean;
    error?: string;
    modelUsed?: string;
}

async function testGLMEndpoint(endpoint: string, model: string, prompt: string): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
        console.log(`\n🔍 Testing endpoint: ${endpoint} with model: ${model}`);
        
        const response = await axios.post(
            `${GLM_BASE_URL}${endpoint}`,
            {
                model: model,
                messages: [
                    { role: 'system', content: 'You are a financial news analyst.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 1000,
            },
            {
                headers: {
                    'Authorization': `Bearer ${GLM_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            }
        );

        const content = response.data.choices?.[0]?.message?.content || '';
        console.log(`✅ Success! Response length: ${content.length}`);
        return { success: true, response: content };
    } catch (error: any) {
        const status = error.response?.status;
        const apiError = error.response?.data?.error?.message || error.response?.data?.message;
        const msg = error.message;
        
        console.log(`❌ Failed: HTTP ${status || 'unknown'}`);
        console.log(`   API Error: ${apiError || 'none'}`);
        console.log(`   Message: ${msg}`);
        
        return { 
            success: false, 
            error: `HTTP ${status}: ${apiError || msg}` 
        };
    }
}

async function listAvailableModels(): Promise<void> {
    console.log('\n📋 Attempting to list available models...');
    
    const endpoints = [
        '/models',
        '/v4/models', 
        '/api/models',
        '/models/list',
    ];
    
    for (const endpoint of endpoints) {
        try {
            const response = await axios.get(
                `${GLM_BASE_URL}${endpoint}`,
                {
                    headers: {
                        'Authorization': `Bearer ${GLM_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                }
            );
            console.log(`✅ Models endpoint found: ${endpoint}`);
            console.log(JSON.stringify(response.data, null, 2));
            return;
        } catch (error: any) {
            console.log(`   ${endpoint}: ${error.response?.status || 'failed'}`);
        }
    }
    console.log('❌ Could not find models endpoint');
}

async function testSimpleCompletion(): Promise<void> {
    console.log('\n🧪 Testing simple completion...');
    
    const simplePrompt = 'Say exactly: "GLM API is working"';
    
    const modelsToTest = [
        'z-ai/glm-4.7-flash',
        'z-ai/glm-4-plus',
        'z-ai/glm-4',
    ];
    
    for (const model of modelsToTest) {
        const result = await testGLMEndpoint('/chat/completions', model, simplePrompt);
        if (result.success && result.response?.includes('GLM API is working')) {
            console.log(`\n🎉 Working model found: ${model}`);
            console.log(`Response: ${result.response}`);
            return;
        }
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log('\n❌ None of the tested models worked');
}

async function testClassification(headline: string): Promise<ClassificationResult> {
    const prompt = `You are a financial news analyst for a crypto/perps trading dashboard.

Analyze this headline and extract specific event details.

HEADLINE: ${headline}

RULES:
1. topic: 3-7 words describing EXACTLY what happened (entity + specific action)
2. subEventType: seizure|approval|launch|hack|announcement|sanction|regulation|earnings|price_surge|price_drop|breakout|partnership|listing|delisting|merger|acquisition|proposal|ruling|protest|conflict|other
3. trendDirection: UP|DOWN|NEUTRAL
4. urgency: CRITICAL|HIGH|MEDIUM|LOW
5. keywords: 4-7 specific entities and terms

Return JSON ONLY:
{
  "topic": "...",
  "subEventType": "...",
  "trendDirection": "UP|DOWN|NEUTRAL",
  "urgency": "CRITICAL|HIGH|MEDIUM|LOW",
  "keywords": ["...", "..."]
}`;

    const modelsToTry = [
        { name: 'z-ai/glm-4.7-flash', endpoint: '/chat/completions' },
        { name: 'z-ai/glm-4-plus', endpoint: '/chat/completions' },
        { name: 'z-ai/glm-4', endpoint: '/chat/completions' },
    ];

    for (const { name, endpoint } of modelsToTry) {
        const result = await testGLMEndpoint(endpoint, name, prompt);
        
        if (result.success && result.response) {
            try {
                const match = result.response.match(/\{[\s\S]*\}/);
                if (match) {
                    const parsed = JSON.parse(match[0]);
                    return {
                        headline,
                        topic: String(parsed.topic || ''),
                        subEventType: String(parsed.subEventType || 'other'),
                        trendDirection: (parsed.trendDirection?.toUpperCase() as 'UP' | 'DOWN' | 'NEUTRAL') || 'NEUTRAL',
                        urgency: (parsed.urgency?.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') || 'MEDIUM',
                        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
                        success: true,
                        modelUsed: name,
                    };
                }
            } catch (e) {
                // Try next model
            }
        }
        
        await new Promise(r => setTimeout(r, 300));
    }

    return {
        headline,
        topic: '',
        subEventType: '',
        trendDirection: 'NEUTRAL',
        urgency: 'MEDIUM',
        keywords: [],
        success: false,
        error: 'All models failed',
    };
}

async function runClassificationTests(): Promise<void> {
    console.log('\n🧪 Running classification tests...\n');
    console.log('='.repeat(80));
    
    const results: ClassificationResult[] = [];
    
    for (const headline of TEST_HEADLINES) {
        console.log(`\n📰 Testing: "${headline.substring(0, 50)}..."`);
        const result = await testClassification(headline);
        results.push(result);
        
        if (result.success) {
            console.log(`   ✅ Topic: ${result.topic}`);
            console.log(`   📊 Trend: ${result.trendDirection} | Urgency: ${result.urgency}`);
            console.log(`   🏷️  Keywords: ${result.keywords.join(', ')}`);
            console.log(`   🤖 Model: ${result.modelUsed}`);
        } else {
            console.log(`   ❌ Failed: ${result.error}`);
        }
        
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 SUMMARY:');
    console.log(`   Total: ${results.length}`);
    console.log(`   Success: ${results.filter(r => r.success).length}`);
    console.log(`   Failed: ${results.filter(r => !r.success).length}`);
    
    // Save results
    const fs = await import('fs');
    fs.writeFileSync('./classification-test-results.json', JSON.stringify(results, null, 2));
    console.log('\n💾 Results saved to classification-test-results.json');
}

async function main() {
    console.log('🚀 GLM API Debug & Classification Test Script');
    console.log('='.repeat(80));
    console.log(`API Key: ${GLM_API_KEY ? '***' + GLM_API_KEY.slice(-4) : 'NOT SET'}`);
    console.log(`Base URL: ${GLM_BASE_URL}`);
    console.log(`Labeling Model: ${LABELING_MODEL}`);
    console.log(`Main Model: ${MAIN_MODEL}`);
    
    // Step 1: List available models
    await listAvailableModels();
    
    // Step 2: Test simple completion
    await testSimpleCompletion();
    
    // Step 3: Run classification tests
    await runClassificationTests();
    
    console.log('\n✨ Done!');
}

main().catch(console.error);
