# Proof Conversion Service

This service monitors the `data/saved_proofs/` directory for new SP1 proof files (`.bin` format) and automatically converts them to Mina-compatible format using the nori-zk library.

Instead of just watching local files, a message queue can be used instead to make this more robust.

## Features

- **File Watching**: Monitors `data/saved_proofs/` for new `.bin` files
- **Automatic Processing**: Processes existing files on startup and new files as they arrive
- **SP1 to Mina Conversion**: Uses nori-zk library to convert SP1 proofs to Mina format
- **Error Handling**: Robust error handling with retry logic and logging
- **Graceful Shutdown**: Proper cleanup on SIGINT/SIGTERM signals

## Architecture

```
data/saved_proofs/     →  [Proof Conversion Service]  →  data/converted_proofs/
    *.bin files              File watching,                   *_converted.json
                            SP1 parsing,
                            nori-zk conversion
```

## Input Format

The service expects `.bin` files in the format: `{start_block}_{end_block}.bin`

Example: `100_200.bin` (blocks 100 to 200)

## Output Format

Converted proofs are saved as JSON files: `{start_block}_{end_block}_converted.json`

```json
{
  "timestamp": "2025-01-13T10:30:00.000Z",
  "originalFile": "100_200.bin",
  "convertedProof": {
    // Mina-compatible proof data from nori-zk conversion
  }
}
```

## Configuration

- `MAX_PROCESSES`: Number of parallel processes for proof conversion (default: 1)

## Usage

### With Docker Compose

The service is automatically included in the op-succinct docker-compose setup:

```bash
cd op-succinct
docker-compose up -d proof-conversion-service
```

### Standalone

```bash
cd proof-conversion-service
npm install
npm start
```

## Development

```bash
cd proof-conversion-service
npm install
npm run dev  # Watch mode
```

## Logs

The service provides detailed logging:
- 📁 Directory setup
- 👀 File watching status
- 🆕 New file detection
- 🔄 Processing progress
- ✅ Successful conversions
- ❌ Error details

## Dependencies

- **chokidar**: File watching
- **@nori-zk/proof-conversion**: SP1 to Mina proof conversion
- **Node.js**: ≥22.0.0

## Known Limitations

1. **SP1 Proof Parsing**: Current implementation uses simplified parsing of the binary SP1 proof format. A production version would need:
   - Proper bincode deserialization for compressed proofs
   - Raw byte parsing for Groth16/PLONK proofs
   - Integration with SP1 SDK types

2. **Error Recovery**: Failed conversions are logged but not automatically retried
