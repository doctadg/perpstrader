#!/usr/bin/env node

// Simple test to verify Z.AI API connectivity and format
const axios = require('axios');

const API_KEY = '4cbc93e369504869888938829ece48ca.cUhcQ6ZlIZ4AQgwc';

async function testZAI() {
  console.log('🔍 Testing Z.AI API connectivity...');
  
  console.log('📋 API Key:', API_KEY ? 'Configured ✓' : 'Not configured ✗');
  
  if (!API_KEY) {
    console.log('❌ Please configure your Z.AI API key first');
    return;
  }

  // Test different possible endpoints
  const endpoints = [
    'https://api.z.ai/v1/chat/completions',
    'https://api.z.ai/api/paas/v4/chat/completions', 
    'https://api.z.ai/api/coding/paas/v4/chat/completions'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`\n🌐 Testing endpoint: ${endpoint}`);
      
      const response = await axios.post(endpoint, {
        model: 'glm-4.6',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant.'
          },
          {
            role: 'user', 
            content: 'Hello, can you respond with just "API working"?'
          }
        ],
        max_tokens: 100,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      console.log(`✅ Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log('🎉 SUCCESS! Response:', response.data.choices[0]?.message?.content || 'No content');
        console.log(`📋 Working endpoint: ${endpoint}`);
        break;
      } else {
        console.log(`❌ Error: ${response.status}`);
        if (response.data) {
          console.log('📄 Response data:', JSON.stringify(response.data, null, 2));
        }
      }
    } catch (error) {
      console.log(`💥 Request failed: ${error.message}`);
    }
  }
}

testZAI();