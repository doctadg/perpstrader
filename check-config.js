const config = require('./bin/shared/config').default.get();
console.log('GLM Base URL:', config.glm.baseUrl);
console.log('GLM Model:', config.glm.model);
console.log('GLM API Key exists:', !!config.glm.apiKey);
console.log('GLM API Key length:', config.glm.apiKey?.length || 0);
console.log('OpenRouter API Key exists:', !!config.openrouter.apiKey);
console.log('OpenRouter API Key length:', config.openrouter.apiKey?.length || 0);
