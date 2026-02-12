#!/bin/bash

# =============================================================================
# SmartAudit Backend Connection Test Script
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        SmartAudit Backend Connection Tests                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if server is running
SERVER_URL="http://localhost:8080"

echo -e "${YELLOW}[1/6]${NC} Testing server health..."
if curl -s "$SERVER_URL/health" > /dev/null; then
    echo -e "${GREEN}✓${NC} Server is running"
    curl -s "$SERVER_URL/health" | jq '.'
else
    echo -e "${RED}✗${NC} Server is not running"
    exit 1
fi

echo ""
echo -e "${YELLOW}[2/6]${NC} Testing database connection..."
if curl -s "$SERVER_URL/ready" > /dev/null; then
    echo -e "${GREEN}✓${NC} Database is connected"
    curl -s "$SERVER_URL/ready" | jq '.'
else
    echo -e "${RED}✗${NC} Database connection failed"
    exit 1
fi

echo ""
echo -e "${YELLOW}[3/6]${NC} Testing session creation..."
SESSION_RESPONSE=$(curl -s -X POST "$SERVER_URL/api/sessions" \
    -H "Content-Type: application/json" \
    -d '{
        "serverId": "test-linux",
        "clientUserId": "test-user-001"
    }')

if echo "$SESSION_RESPONSE" | jq -e '.success' > /dev/null; then
    echo -e "${GREEN}✓${NC} Session created successfully"
    SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.data.id')
    echo "Session ID: $SESSION_ID"
else
    echo -e "${RED}✗${NC} Session creation failed"
    echo "$SESSION_RESPONSE" | jq '.'
    exit 1
fi

echo ""
echo -e "${YELLOW}[4/6]${NC} Testing session retrieval..."
if curl -s "$SERVER_URL/api/sessions/$SESSION_ID" | jq -e '.success' > /dev/null; then
    echo -e "${GREEN}✓${NC} Session retrieved successfully"
else
    echo -e "${RED}✗${NC} Session retrieval failed"
    exit 1
fi

echo ""
echo -e "${YELLOW}[5/6]${NC} Testing storage endpoints..."
if curl -s "$SERVER_URL/api/storage/usage" | jq -e '.success' > /dev/null; then
    echo -e "${GREEN}✓${NC} Storage usage endpoint working"
    curl -s "$SERVER_URL/api/storage/usage" | jq '.'
else
    echo -e "${RED}✗${NC} Storage endpoint failed"
    exit 1
fi

echo ""
echo -e "${YELLOW}[6/6]${NC} Testing session end..."
END_RESPONSE=$(curl -s -X POST "$SERVER_URL/api/sessions/$SESSION_ID/end")
if echo "$END_RESPONSE" | jq -e '.success' > /dev/null; then
    echo -e "${GREEN}✓${NC} Session ended successfully"
else
    echo -e "${RED}✗${NC} Session end failed"
    echo "$END_RESPONSE" | jq '.'
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              All Tests Passed Successfully! ✓              ║"
echo "╚════════════════════════════════════════════════════════════╝"
