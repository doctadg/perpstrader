#!/bin/bash
# Quick Test Script for Enhanced Clustering Integration
# Verifies all components are working correctly

echo "================================================================"
echo "  Enhanced Clustering Integration Test"
echo "================================================================"
echo ""

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

TESTS_PASSED=0
TESTS_FAILED=0

test_pass() {
    echo "[PASS] $1"
    ((TESTS_PASSED++))
}

test_fail() {
    echo "[FAIL] $1"
    ((TESTS_FAILED++))
}

test_warn() {
    echo "[WARN] $1"
}

echo "================================================================"
echo "  1. File Structure Verification"
echo "================================================================"
echo ""

# Check enhanced routes file
if [ -f "src/dashboard/enhanced-api-routes.ts" ]; then
    test_pass "Enhanced API routes file exists"
else
    test_fail "Enhanced API routes file missing"
fi

# Check setup script
if [ -f "scripts/setup-enhanced-clustering.sh" ]; then
    test_pass "Setup script exists"
else
    test_fail "Setup script missing"
fi

# Check migration runner
if [ -f "migrations/run-002.sh" ]; then
    test_pass "Migration runner exists"
else
    test_fail "Migration runner missing"
fi

# Check migration SQL
if [ -f "migrations/002_cluster_enhancements.sql" ]; then
    test_pass "Migration SQL file exists"
else
    test_fail "Migration SQL file missing"
fi

# Check documentation
if [ -f "ENHANCED-FEATURES.md" ]; then
    test_pass "Enhanced features documentation exists"
else
    test_fail "Enhanced features documentation missing"
fi

# Check integration summary
if [ -f "INTEGRATION-SUMMARY.md" ]; then
    test_pass "Integration summary exists"
else
    test_fail "Integration summary missing"
fi

echo ""
echo "================================================================"
echo "  2. TypeScript Build Verification"
echo "================================================================"
echo ""

# Check compiled dashboard-server
if [ -f "bin/dashboard/dashboard-server.js" ]; then
    test_pass "Dashboard server compiled"
else
    test_fail "Dashboard server not compiled"
fi

# Check compiled enhanced routes
if [ -f "bin/dashboard/enhanced-api-routes.js" ]; then
    test_pass "Enhanced API routes compiled"
else
    test_fail "Enhanced API routes not compiled"
fi

# Check compiled news-agent graph
if [ -f "bin/news-agent/graph.js" ]; then
    test_pass "News agent graph compiled"
else
    test_fail "News agent graph not compiled"
fi

# Verify enhanced routes are mounted
if grep -q "api/enhanced" bin/dashboard/dashboard-server.js; then
    test_pass "Enhanced routes mounted in dashboard"
else
    test_fail "Enhanced routes not mounted in dashboard"
fi

# Verify env variable updated
if grep -q "ENHANCED_CLUSTERING_ENABLED" bin/news-agent/graph.js; then
    test_pass "Environment variable ENHANCED_CLUSTERING_ENABLED used"
else
    test_fail "Environment variable not updated in news agent"
fi

echo ""
echo "================================================================"
echo "  3. NPM Scripts Verification"
echo "================================================================"
echo ""

# Check for new scripts
if grep -q "start:news-agent" package.json; then
    test_pass "npm script start:news-agent exists"
else
    test_fail "npm script start:news-agent missing"
fi

if grep -q "start:dashboard" package.json; then
    test_pass "npm script start:dashboard exists"
else
    test_fail "npm script start:dashboard missing"
fi

if grep -q "setup:enhanced" package.json; then
    test_pass "npm script setup:enhanced exists"
else
    test_fail "npm script setup:enhanced missing"
fi

if grep -q "migrate:002" package.json; then
    test_pass "npm script migrate:002 exists"
else
    test_fail "npm script migrate:002 missing"
fi

echo ""
echo "================================================================"
echo "  4. Code Integration Verification"
echo "================================================================"
echo ""

# Check dashboard server imports
if grep -q "import.*enhancedApiRoutes" src/dashboard/dashboard-server.ts; then
    test_pass "Dashboard server imports enhanced routes"
else
    test_fail "Dashboard server missing enhanced routes import"
fi

# Check news agent imports enhanced node
if grep -q "import.*enhancedStoryClusterNode" src/news-agent/graph.ts; then
    test_pass "News agent imports enhanced clustering node"
else
    test_fail "News agent missing enhanced clustering node import"
fi

# Check enhanced clustering logic
if grep -q "useEnhancedClustering.*ENHANCED_CLUSTERING_ENABLED" src/news-agent/graph.ts; then
    test_pass "Enhanced clustering uses correct environment variable"
else
    test_fail "Enhanced clustering environment variable incorrect"
fi

# Check fallback logic
if grep -q "storyClusterNode" src/news-agent/graph.ts; then
    test_pass "Fallback to original clustering present"
else
    test_fail "Fallback clustering missing"
fi

echo ""
echo "================================================================"
echo "  Test Summary"
echo "================================================================"
echo ""
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo "[SUCCESS] All integration tests passed!"
    echo ""
    echo "Next steps:"
    echo "1. Run migration: bash migrations/run-002.sh"
    echo "2. Start services: npm run start:news-agent && npm run start:dashboard"
    echo "3. Test API: curl http://localhost:3001/api/enhanced/news/decay-config"
    echo "4. View documentation: cat ENHANCED-FEATURES.md"
    exit 0
else
    echo "[FAILURE] Some tests failed. Please review output above."
    exit 1
fi
