#!/bin/bash

# Saki AI Startup Script for Linux/macOS
# Sets UTF-8 encoding
export LANG=en_US.UTF-8

echo "=========================================="
echo "   Saki AI Startup Script"
echo "=========================================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[Error] Node.js is not installed. Please install Node.js first!"
    exit 1
fi

echo "[1/1] Starting Saki AI (Backend & Frontend)..."
echo "Tip: First run might take some time to install dependencies."
echo ""

# Check if dependency installation is needed
if [ ! -d "node_modules" ]; then
    echo "[*] Installing root dependencies..."
    npm install
fi

if [ ! -d "backend/node_modules" ]; then
    echo "[*] Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "[*] Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

echo "[*] Starting services..."
npm run dev
