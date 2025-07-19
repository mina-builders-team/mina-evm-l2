#!/bin/bash

# Script to copy the SP1 proof to JSON converter binary to local bin
set -e

BINARY_SOURCE="../target/release/sp1-proof-to-json"
BINARY_DEST="./bin/sp1-proof-to-json"

echo "📋 Copying SP1 proof to JSON converter binary..."

# Create bin directory if it doesn't exist
mkdir -p ./bin

# Check if source binary exists
if [ ! -f "$BINARY_SOURCE" ]; then
    echo "❌ Source binary not found at $BINARY_SOURCE"
    echo "🔨 Building binary first..."
    ./scripts/build-converter.sh
fi

# Copy the binary
cp "$BINARY_SOURCE" "$BINARY_DEST"

# Make it executable
chmod +x "$BINARY_DEST"

echo "✅ Binary copied to $BINARY_DEST"
echo "📍 You can now use: $BINARY_DEST -i <input.bin> -o <output.json>"
