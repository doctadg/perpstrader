const axios = require('axios');
require('dotenv').config();

async function testOpenRouter() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    console.log('API Key length:', apiKey?.length || 0);
    
    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'z-ai/glm-4.7-flash',
            messages: [{ role: 'user', content: 'Say "test successful"' }],
            max_tokens: 20
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        console.log('SUCCESS:', JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.log('FAILED:', error.response?.status, error.response?.data?.error?.message || error.message);
        return false;
    }
}

testOpenRouter();
