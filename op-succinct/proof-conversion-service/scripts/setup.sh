#!/bin/bash

# Complete setup script for proof conversion service
set -e

echo "🚀 Setting up proof conversion service..."

# Step 1: Build the converter binary
echo "1️⃣ Building SP1 proof to JSON converter..."
./scripts/build-converter.sh

# Step 2: Copy binary to local bin
echo "2️⃣ Copying binary to local bin..."
./scripts/copy-converter.sh

# Step 3: Install Node.js dependencies
echo "3️⃣ Installing Node.js dependencies..."
npm install

echo "✅ Setup completed successfully!"
echo ""
echo "🎯 Next steps:"
echo "   • Run 'npm start' to start the proof conversion service"
echo "   • Place .bin proof files in /data/saved_proofs to process them"
echo "   • Converted proofs will appear in /data/converted_proofs"