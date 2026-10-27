import fs from 'node:fs';
import path from 'node:path';
import {
  chunkData,
  DataDescriptor,
  DerbyClient,
  UploadTransferManager,
  type UploadProgress,
} from 'derby-tools';
import { resolveSecretKey } from '../keys.js';
import { writeDescriptor } from '../descriptor-source.js';
import { protocolError, usageError } from '../errors.js';
import { debug, info, progressLine } from '../progress.js';

export interface UploadOptions {
  storageKey: string;
  nodes: string;
  blockSize?: string;
  mimeType?: string;
  name?: string;
  descriptorOut?: string;
}

const DEFAULT_BLOCK_SIZE = 512000;
const MIN_BLOCK_SIZE = 1000;

export async function uploadCommand(file: string, options: UploadOptions): Promise<void> {
  if (!fs.existsSync(file)) {
    throw usageError('File not found: ' + file);
  }
  if (!options.nodes) {
    throw usageError('--nodes <wss://a,wss://b> is required');
  }
  const relayURLs = options.nodes.split(',').map(s => s.trim()).filter(Boolean);
  if (relayURLs.length === 0) {
    throw usageError('Invalid storage node list');
  }
  const blockSize = options.blockSize ? Number.parseInt(options.blockSize, 10) : DEFAULT_BLOCK_SIZE;
  if (!Number.isFinite(blockSize) || blockSize < MIN_BLOCK_SIZE) {
    throw usageError(`Invalid block size: ${options.blockSize}. Minimum block size is ${MIN_BLOCK_SIZE} bytes.`);
  }
  const secretKey = resolveSecretKey(options.storageKey);

  const fileData = new Uint8Array(fs.readFileSync(file));
  const chunks = chunkData(fileData, blockSize);
  if (chunks.length === 0) {
    throw usageError('Error breaking up file data (empty file?)');
  }
  debug(`Broke data into ${chunks.length} chunks of up to ${blockSize} bytes`);

  const descriptor = new DataDescriptor();
  descriptor.setDataMimeType(options.mimeType ?? '');
  descriptor.setFilename(options.name ?? path.basename(file));

  info('Connecting to storage nodes: ' + relayURLs.join(', '));
  const clients = await Promise.all(relayURLs.map(async url => {
    const client = new DerbyClient(url);
    try {
      await client.connect();
      return client;
    } catch (e) {
      throw protocolError(`Could not connect to storage node ${url}: ${(e as Error).message}`);
    }
  }));

  try {
    const uploader = new UploadTransferManager(clients, descriptor, secretKey);
    uploader.importDataChunksList(chunks);

    await uploader.upload((progress: UploadProgress) => {
      if (progress.error) {
        progressLine(`Node ${progress.relayURL}: block ${progress.blockIndex} failed: ${progress.error.message}`);
      } else {
        const pct = Math.ceil((progress.completedBlocks / progress.totalBlocks) * 100);
        progressLine(`Node ${progress.relayURL}: published pointer ${progress.pointerId} (${pct}% - ${progress.completedBlocks}/${progress.totalBlocks})`);
      }
    });

    info('Upload completed');
    const defaultOut = path.basename(file) + '.derby.json';
    writeDescriptor(descriptor, options.descriptorOut ?? defaultOut);
  } finally {
    for (const client of clients) {
      client.close();
    }
  }
}
