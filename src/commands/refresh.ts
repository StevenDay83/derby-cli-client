import fs from 'node:fs';
import {
  DataDescriptor,
  generatePointerId,
  generateSignature,
  getPublicKey,
  hashData,
  type BlobBlock,
  type Pointer,
} from 'derby-tools';
import { loadDescriptor, writeDescriptor } from '../descriptor-source.js';
import { resolveSecretKey } from '../keys.js';
import { CLIError, protocolError, usageError } from '../errors.js';
import { RelayPool } from '../relay-pool.js';
import { info } from '../progress.js';

export interface RefreshOptions {
  storageKey: string;
  data?: string;
  descriptorOut?: string;
}

function allRelays(blobMap: BlobBlock[]): string[] {
  const relays = new Set<string>();
  for (const block of blobMap) {
    for (const relay of block[2]) {
      relays.add(relay.toLowerCase());
    }
  }
  return [...relays];
}

// A refreshed pointer keeps pubkey/pointerhash/size (so the relay replaces the
// old pointer) but gets a fresh timestamp and a random nonce >= 10 so it can
// never collide with a deletion pointer's 0-9 nonce range.
function buildRefreshPointer(secretKey: string, block: BlobBlock): Pointer {
  const [, pointerHash, , size] = block;
  const pointer: Pointer = {
    pubkey: getPublicKey(secretKey),
    timestamp: Math.floor(Date.now() / 1000),
    pointerhash: pointerHash,
    size,
    nonce: Math.floor(Math.random() * (1000000 - 10) + 10),
  };
  pointer.id = generatePointerId(pointer);
  pointer.signature = generateSignature(secretKey, pointer);
  return pointer;
}

// Splits the file exactly along the descriptor's block sizes and verifies each
// chunk against the descriptor's block hash.
function splitDataByDescriptor(data: Uint8Array, blobMap: BlobBlock[]): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  blobMap.forEach((block, index) => {
    const [, pointerHash, , size] = block;
    const chunk = data.slice(offset, offset + size);
    if (chunk.length !== size) {
      throw usageError(`Data file is too short: block ${index} expects ${size} bytes`);
    }
    if (hashData(chunk) !== pointerHash) {
      throw usageError(
        `Data file does not match the descriptor: block ${index} hash mismatch ` +
        `(expected ${pointerHash}, got ${hashData(chunk)})`,
      );
    }
    chunks.push(chunk);
    offset += size;
  });
  if (offset !== data.length) {
    throw usageError(`Data file is larger than the descriptor's total size (${data.length} > ${offset} bytes)`);
  }
  return chunks;
}

export async function refreshCommand(source: string, options: RefreshOptions): Promise<void> {
  const secretKey = resolveSecretKey(options.storageKey);
  const { descriptor, filePath } = await loadDescriptor(source);
  const blobMap = descriptor.blobMap as BlobBlock[];

  let chunks: Uint8Array[] | undefined;
  if (options.data) {
    if (!fs.existsSync(options.data)) {
      throw usageError('File not found: ' + options.data);
    }
    chunks = splitDataByDescriptor(new Uint8Array(fs.readFileSync(options.data)), blobMap);
  }

  const pool = new RelayPool();
  await pool.connectAll(allRelays(blobMap));
  for (const relay of pool.unreachable()) {
    console.error(`Warning: storage node ${relay} is unreachable`);
  }

  let failures = 0;
  const newBlobMap: BlobBlock[] = [];
  try {
    for (const [index, block] of blobMap.entries()) {
      const pointer = buildRefreshPointer(secretKey, block);
      const relayList = block[2];
      let publishedSomewhere = false;
      for (const relayEntry of relayList) {
        const relay = relayEntry.toLowerCase();
        const client = pool.tryGet(relay);
        if (!client) {
          failures++;
          console.error(`Node ${relay}: skipped (unreachable) for pointer ${block[0]}`);
          continue;
        }
        try {
          await client.publishPointer(pointer, chunks?.[index]);
          info(`Node ${relay}: refreshed pointer ${block[0]} -> ${pointer.id}`);
          publishedSomewhere = true;
        } catch (e) {
          failures++;
          console.error(`Node ${relay}: refresh failed for pointer ${block[0]}: ${(e as Error).message}`);
        }
      }
      if (!publishedSomewhere) {
        throw new CLIError(`Refresh failed for block ${index}: no relay accepted the pointer`, 2);
      }
      newBlobMap.push([pointer.id!, block[1], relayList, block[3]]);
    }
  } finally {
    pool.closeAll();
  }

  descriptor.blobMap = newBlobMap;
  // Re-import through the JSON round trip to recompute size/merkle root.
  const json = descriptor.generateDataDescriptorJSON();
  const refreshed = new DataDescriptor();
  refreshed.importDescriptor(json);

  if (filePath && !options.descriptorOut) {
    writeDescriptor(refreshed, filePath);
  } else {
    writeDescriptor(refreshed, options.descriptorOut ?? 'stdout');
  }

  if (failures > 0) {
    throw protocolError(`Refresh completed with ${failures} failure(s)`);
  }
  info('Refresh completed');
}
