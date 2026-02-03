#!/bin/bash

# Build script to flatten TypeScript output

echo "🔨 Building and flattening TypeScript..."

# Clean previous build
rm -rf bin/*
mkdir -p bin

# Build TypeScript
npx tsc

# Flatten the output
echo "📁 Flattening build output..."
cd bin

# Move all files from subdirectories to bin root
find . -mindepth 2 -type f -exec mv {} . \;

# Remove empty subdirectories
find . -mindepth 1 -type d -exec rm -rf {} \;

# Make sure main executables exist
if [ -f "agent-core/ai-agent.js" ]; then
    mv agent-core/ai-agent.js agent.js
fi

if [ -f "dashboard/dashboard.js" ]; then
    mv dashboard/dashboard.js dashboard.js
fi

if [ -f "execution-engine/execution.js" ]; then
    mv execution-engine/execution.js execution.js
fi

if [ -f "research-engine/research.js" ]; then
    mv research-engine/research.js research.js
fi

if [ -f "data-manager/data-manager.js" ]; then
    mv data-manager/data-manager.js data-manager.js
fi

# Clean up any remaining directories
rm -rf agent-core dashboard execution-engine research-engine data-manager strategy-engine ta-module risk-manager shared

echo "✅ Build completed successfully!"
echo "📋 Executables created:"
ls -la *.js 2>/dev/null || echo "No JS files found"