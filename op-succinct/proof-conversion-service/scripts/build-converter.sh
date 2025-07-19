#!/bin/bash

# Script to build the SP1 proof to JSON converter binary
set -e

echo "🔨 Building SP1 proof to JSON converter..."

# Change to the utils directory where the binary is defined
cd ../scripts/utils

# Build the binary in release mode
cargo build --release --bin sp1-proof-to-json

echo "✅ Build completed successfully"

# Check if the binary was created
if [ -f "../../target/release/sp1-proof-to-json" ]; then
    echo "📍 Binary location: ../../target/release/sp1-proof-to-json"
else
    echo "❌ Binary not found at expected location"
    exit 1
fi
