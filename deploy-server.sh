#!/bin/bash

# SmartAudit Server Deployment Script
echo "🚀 Starting SmartAudit Server Deployment..."

# สร้าง recordings directory
mkdir -p recordings

# คัดลอก env file
echo "📝 Setting up environment..."
cp apps/backend/.env.server apps/backend/.env

# Build และ deploy
echo "🔨 Building and starting services..."
docker compose -f docker-compose.server.yml down
docker compose -f docker-compose.server.yml build
docker compose -f docker-compose.server.yml up -d

# ตรวจสอบสถานะ
echo "✅ Checking service status..."
sleep 5
docker compose -f docker-compose.server.yml ps

echo "🎉 Deployment complete!"
echo "📍 Backend: http://localhost:8080"
echo "📍 Guacd: localhost:4822"
echo ""
echo "📋 Check logs:"
echo "  docker compose -f docker-compose.server.yml logs guacd"
echo "  docker compose -f docker-compose.server.yml logs backend"
