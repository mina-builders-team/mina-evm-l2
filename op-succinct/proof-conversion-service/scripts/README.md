# Proof Conversion Service Scripts

This directory contains scripts to build and manage the SP1 proof to JSON converter binary.

## Scripts

### `setup.sh`
Complete setup script that:
1. Builds the SP1 proof to JSON converter with v5.0.0
2. Copies the binary to local bin directory
3. Installs Node.js dependencies

```bash
npm run setup
# or
./scripts/setup.sh
```

### `build-converter.sh`
Builds the SP1 proof to JSON converter binary from the updated source code.

```bash
npm run build-converter
# or
./scripts/build-converter.sh
```

### `copy-converter.sh`
Copies the built binary to the local `bin/` directory for use by the service.

```bash
npm run copy-converter
# or
./scripts/copy-converter.sh
```

## Usage

1. **Initial Setup**: Run `npm run setup` to build everything
2. **Rebuild Only**: Run `npm run build-converter` if you change the Rust code
3. **Copy Only**: Run `npm run copy-converter` if you just need to update the local binary

## Binary Priority

The service tries binaries in this order:
1. `./bin/sp1-proof-to-json` (local binary built with SP1 v5.0.0)
2. `/usr/local/bin/sp1-proof-to-json` (global binary)
3. `./target/release/sp1-proof-to-json` (relative path fallback)