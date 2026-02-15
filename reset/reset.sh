#!/bin/bash

# Saki AI Reset Script for Linux/macOS
export LANG=en_US.UTF-8

echo ""
echo "=========================================="
echo "   Saki AI Data Reset Tool"
echo "=========================================="
echo ""
echo "[WARNING] This will PERMANENTLY delete all user data, including:"
echo ""
echo "  1. All Chat Sessions"
echo "  2. All Uploaded Files and Reports"
echo "  3. All Memories and Hosted Tasks"
echo "  4. All Configuration and Auth Tokens"
echo ""
echo "  !!! THIS CANNOT BE UNDONE !!!"
echo ""

read -p "Are you sure you want to reset all data? (y/N): " choice
if [[ ! "$choice" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "[*] Stopping any running Node.js processes..."
pkill -f "node" 2>/dev/null

echo ""
echo "[1/4] Cleaning data folders..."

rm -rf data/files/*
rm -rf data/memories/*
rm -rf data/reports/*
rm -rf data/sessions/*
rm -rf data/Trash/*
rm -rf data/uploads/*
rm -rf data/history.json

# Recreate .gitkeep or ensure empty dirs exist
mkdir -p data/files
mkdir -p data/memories
mkdir -p data/reports
mkdir -p data/sessions
mkdir -p data/Trash
mkdir -p data/uploads

echo "[2/4] Resetting Configuration..."
rm -f data/global_config.json
rm -f data/mcp_config.json

echo "[3/4] Cleaning browser cache (partial)..."
# In this context, we can't clean client browser cache easily, but we cleaned the server state.

echo ""
echo "=========================================="
echo "   Reset Complete."
echo "   You can now run ./start.sh to initialize a fresh instance."
echo "=========================================="
echo ""
