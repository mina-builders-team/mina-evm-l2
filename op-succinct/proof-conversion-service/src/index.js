import chokidar from 'chokidar';
import { promises as fs } from 'fs';
import path from 'path';
import { ComputationalPlanExecutor, performSp1ToPlonk } from '@nori-zk/proof-conversion';

const SAVED_PROOFS_DIR = '/data/saved_proofs';
const CONVERTED_PROOFS_DIR = '/data/converted_proofs';
const MAX_PROCESSES = parseInt(process.env.MAX_PROCESSES || '1');

class ProofConversionService {
  constructor() {
    this.executor = new ComputationalPlanExecutor(MAX_PROCESSES);
    this.processedFiles = new Set();
    this.isShuttingDown = false;
  }

  async init() {
    try {
      await fs.mkdir(SAVED_PROOFS_DIR, { recursive: true });
      await fs.mkdir(CONVERTED_PROOFS_DIR, { recursive: true });
      console.log('📁 Directories created/verified');

      await this.processExistingFiles();
      this.startWatching();

      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

      console.log('🚀 Proof conversion service started');
    } catch (error) {
      console.error('❌ Failed to initialize service:', error);
      process.exit(1);
    }
  }

  async processExistingFiles() {
    console.log('🔍 Processing existing proof files...');
    try {
      const files = await fs.readdir(SAVED_PROOFS_DIR);
      const binFiles = files.filter(file => file.endsWith('.bin'));

      for (const file of binFiles) {
        await this.processProofFile(path.join(SAVED_PROOFS_DIR, file));
      }

      console.log(`✅ Processed ${binFiles.length} existing files`);
    } catch (error) {
      console.error('❌ Error processing existing files:', error);
    }
  }

  startWatching() {
    console.log(`👀 Watching directory: ${SAVED_PROOFS_DIR}`);

    const watcher = chokidar.watch(SAVED_PROOFS_DIR, {
      ignored: /[\/\\]\./,
      persistent: true,
      ignoreInitial: true
    });

    watcher.on('add', (filePath) => {
      if (filePath.endsWith('.bin')) {
        console.log(`🆕 New proof file detected: ${path.basename(filePath)}`);
        this.processProofFile(filePath);
      }
    });

    watcher.on('error', (error) => {
      console.error('❌ Watcher error:', error);
    });

    this.watcher = watcher;
  }

  async processProofFile(filePath) {
    const fileName = path.basename(filePath);

    if (this.processedFiles.has(fileName) || this.isShuttingDown) {
      return;
    }

    try {
      console.log(`🔄 Processing proof file: ${fileName}`);
      this.processedFiles.add(fileName);

      const proofData = await this.parseProofFile(filePath);
      if (!proofData) {
        console.error(`❌ Failed to parse proof file: ${fileName}`);
        return;
      }

      const convertedProof = await this.convertProof(proofData);
      const outputPath = await this.saveConvertedProof(fileName, convertedProof);

      console.log(`✅ Successfully converted ${fileName} -> ${path.basename(outputPath)}`);
    } catch (error) {
      console.error(`❌ Error processing ${fileName}:`, error);
      this.processedFiles.delete(fileName);
    }
  }

  async parseProofFile(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);

      // Extract block range from filename (format: start_block_end_block.bin)
      const match = fileName.match(/^(\d+)_(\d+)\.bin$/);
      if (!match) {
        throw new Error(`Invalid filename format: ${fileName}`);
      }

      const [, startBlock, endBlock] = match;

      // The .bin file contains SP1 proof bytes
      // For now, we'll attempt to parse it as a JSON-compatible structure
      // In a real implementation, you'd need to properly deserialize the SP1Proof

      // This is a simplified approach - in practice you'd need to:
      // 1. Determine if it's a compressed proof (bincode) or raw bytes
      // 2. Parse accordingly to extract the SP1ProofWithPublicValues
      // 3. Convert to the expected Sp1 format for nori-zk

      console.log(`📊 Proof file size: ${fileBuffer.length} bytes`);
      console.log(`📋 Block range: ${startBlock} - ${endBlock}`);

      // For now, return a placeholder structure
      // TODO: Implement proper SP1 proof parsing from binary format
      const sp1ProofStructure = {
        proof: {
          Plonk: {
            encoded_proof: fileBuffer.toString('hex'),
            public_inputs: [`0x${'0'.repeat(64)}`] // Placeholder VK
          }
        },
        public_values: {
          buffer: {
            data: Array.from(fileBuffer.slice(0, Math.min(32, fileBuffer.length)))
          }
        },
        metadata: {
          startBlock: parseInt(startBlock),
          endBlock: parseInt(endBlock),
          originalSize: fileBuffer.length
        }
      };

      return sp1ProofStructure;
    } catch (error) {
      console.error(`Failed to parse proof file ${filePath}:`, error);
      return null;
    }
  }

  async convertProof(sp1ProofData) {
    try {
      console.log('🔄 Converting SP1 proof to Mina format...');

      const result = await performSp1ToPlonk(this.executor, sp1ProofData);

      console.log('✅ Proof conversion completed');
      return result;
    } catch (error) {
      console.error('❌ Proof conversion failed:', error);
      throw error;
    }
  }

  async saveConvertedProof(originalFileName, convertedProof) {
    try {
      const baseName = originalFileName.replace('.bin', '');
      const outputFileName = `${baseName}_converted.json`;
      const outputPath = path.join(CONVERTED_PROOFS_DIR, outputFileName);

      const proofData = {
        timestamp: new Date().toISOString(),
        originalFile: originalFileName,
        convertedProof: convertedProof
      };

      await fs.writeFile(outputPath, JSON.stringify(proofData, null, 2));

      return outputPath;
    } catch (error) {
      console.error('❌ Failed to save converted proof:', error);
      throw error;
    }
  }

  async shutdown() {
    if (this.isShuttingDown) return;

    console.log('🛑 Shutting down proof conversion service...');
    this.isShuttingDown = true;

    try {
      if (this.watcher) {
        await this.watcher.close();
      }

      await this.executor.terminate();
      console.log('✅ Service shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    } finally {
      process.exit(0);
    }
  }
}

// Start the service
const service = new ProofConversionService();
service.init().catch((error) => {
  console.error('❌ Failed to start service:', error);
  process.exit(1);
});