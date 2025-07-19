import chokidar from 'chokidar';
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
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
      const fileName = path.basename(filePath);

      // Extract block range from filename (format: start_block-end_block.bin)
      const match = fileName.match(/^(\d+)-(\d+)\.bin$/);
      if (!match) {
        throw new Error(`Invalid filename format: ${fileName}`);
      }

      const [, startBlock, endBlock] = match;

      // Create temporary output file for the JSON conversion
      const tempOutputPath = `/tmp/${fileName.replace('.bin', '_parsed.json')}`;

      // Call the Rust binary to convert SP1 proof to JSON
      const execFileAsync = promisify(execFile);

      console.log(`🔄 Converting ${fileName} using sp1-proof-to-json binary...`);
      
      try {
        // Try local binary first (built with updated SP1 v5.0.0)
        await execFileAsync('./bin/sp1-proof-to-json', [
          '-i', filePath,
          '-o', tempOutputPath
        ]);
      } catch (execError) {
        try {
          // Fallback to global binary
          await execFileAsync('/usr/local/bin/sp1-proof-to-json', [
            '-i', filePath,
            '-o', tempOutputPath
          ]);
        } catch (execError2) {
          // Final fallback to relative path
          await execFileAsync('./target/release/sp1-proof-to-json', [
            '-i', filePath, 
            '-o', tempOutputPath
          ]);
        }
      }

      // Read the converted JSON
      const jsonData = await fs.readFile(tempOutputPath, 'utf8');
      const parsedProof = JSON.parse(jsonData);

      // Clean up temporary file
      await fs.unlink(tempOutputPath).catch(() => {}); // Ignore cleanup errors

      console.log(`✅ Successfully parsed ${fileName} (${startBlock}-${endBlock})`);
      return parsedProof;

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