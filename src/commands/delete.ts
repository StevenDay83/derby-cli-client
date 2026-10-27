import {
  generatePointerId,
  generateSignature,
  getPublicKey,
  type BlobBlock,
  type Pointer,
} from 'derby-tools';
import { loadDescriptor } from '../descriptor-source.js';
import { resolveSecretKey } from '../keys.js';
import { CLIError, protocolError } from '../errors.js';
import { RelayPool } from '../relay-pool.js';
import { info } from '../progress.js';

export interface DeleteOptions {
  storageKey: string;
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

// Builds a spec-compliant deletion pointer: same pubkey/pointerhash/size as
// the target, a nonce in 0-9 that differs from the target's, and a fresh
// timestamp (the relay rejects timestamps outside ±300s).
function buildDeletionPointer(secretKey: string, block: BlobBlock, existingNonce?: number): Pointer {
  const [, pointerHash, , size] = block;
  let nonce = Math.floor(Math.random() * 10);
  if (existingNonce != undefined && existingNonce >= 0 && existingNonce <= 9 && nonce === existingNonce) {
    nonce = (nonce + 1) % 10;
  }
  const pointer: Pointer = {
    pubkey: getPublicKey(secretKey),
    timestamp: Math.floor(Date.now() / 1000),
    pointerhash: pointerHash,
    size,
    nonce,
  };
  pointer.id = generatePointerId(pointer);
  pointer.signature = generateSignature(secretKey, pointer);
  return pointer;
}

export async function deleteCommand(source: string, options: DeleteOptions): Promise<void> {
  const secretKey = resolveSecretKey(options.storageKey);
  const { descriptor } = await loadDescriptor(source);
  const blobMap = descriptor.blobMap as BlobBlock[];

  const pool = new RelayPool();
  await pool.connectAll(allRelays(blobMap));
  for (const relay of pool.unreachable()) {
    console.error(`Warning: storage node ${relay} is unreachable`);
  }

  let failures = 0;
  try {
    for (const block of blobMap) {
      const [pointerId, , relayList] = block;

      // Fetch the existing pointer once so the deletion nonce differs from it.
      let existingNonce: number | undefined;
      for (const relayEntry of relayList) {
        const client = pool.tryGet(relayEntry.toLowerCase());
        if (!client) {
          continue;
        }
        try {
          const found = await client.requestPointers({ ids: [pointerId] });
          if (found.length > 0) {
            existingNonce = found[0]!.nonce;
          }
          break;
        } catch {
          // try the next relay
        }
      }

      const deletionPointer = buildDeletionPointer(secretKey, block, existingNonce);
      for (const relayEntry of relayList) {
        const relay = relayEntry.toLowerCase();
        const client = pool.tryGet(relay);
        if (!client) {
          failures++;
          console.error(`Node ${relay}: skipped (unreachable) for pointer ${pointerId}`);
          continue;
        }
        try {
          const result = await client.deletePointer(deletionPointer);
          info(`Node ${relay}: deleted pointer ${result.deletedId}`);
        } catch (e) {
          failures++;
          console.error(`Node ${relay}: failed to delete pointer ${pointerId}: ${(e as Error).message}`);
        }
      }
    }
  } finally {
    pool.closeAll();
  }

  if (failures > 0) {
    throw protocolError(`Delete completed with ${failures} failure(s)`);
  }
  info('Delete completed');
}
