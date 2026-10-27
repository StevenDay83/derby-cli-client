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

// Builds a spec-compliant deletion pointer. The relay requires: same
// pubkey/pointerhash/size as the target; a nonce in 0-8 that differs from the
// target's nonce; and a timestamp strictly newer than the target's and within
// ±300s of the relay's clock.
function buildDeletionPointer(secretKey: string, block: BlobBlock, existing?: Pointer): Pointer {
  const [, pointerHash, , size] = block;
  const now = Math.floor(Date.now() / 1000);
  let nonce = Math.floor(Math.random() * 9);
  if (existing && existing.nonce >= 0 && existing.nonce <= 8 && nonce === existing.nonce) {
    nonce = (nonce + 1) % 9;
  }
  const timestamp = existing ? Math.max(now, existing.timestamp + 1) : now;
  const pointer: Pointer = {
    pubkey: getPublicKey(secretKey),
    timestamp,
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

      // Fetch the existing pointer once so the deletion nonce differs from it
      // and the deletion timestamp is strictly newer (both relay-enforced).
      let existing: Pointer | undefined;
      for (const relayEntry of relayList) {
        const client = pool.tryGet(relayEntry.toLowerCase());
        if (!client) {
          continue;
        }
        try {
          const found = await client.requestPointers({ ids: [pointerId] });
          if (found.length > 0) {
            existing = found[0];
          }
          break;
        } catch {
          // try the next relay
        }
      }

      const deletionPointer = buildDeletionPointer(secretKey, block, existing);
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
