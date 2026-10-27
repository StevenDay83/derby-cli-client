import type { BlobBlock } from 'derby-tools';
import { loadDescriptor } from '../descriptor-source.js';
import { CLIError } from '../errors.js';
import { RelayPool } from '../relay-pool.js';
import { info } from '../progress.js';

// Verifies every pointer in the blob map exists on each relay listed for its
// block. Exits 0 when all present, 3 when any are missing.
export async function checkCommand(source: string): Promise<void> {
  const { descriptor } = await loadDescriptor(source);

  // Group pointer ids by relay so each relay gets one query.
  const idsByRelay = new Map<string, string[]>();
  const allIds = new Set<string>();
  for (const block of descriptor.blobMap as BlobBlock[]) {
    const [pointerId, , relayList] = block;
    allIds.add(pointerId);
    for (const relayEntry of relayList) {
      const relay = relayEntry.toLowerCase();
      const list = idsByRelay.get(relay) ?? [];
      list.push(pointerId);
      idsByRelay.set(relay, list);
    }
  }

  const pool = new RelayPool();
  await pool.connectAll([...idsByRelay.keys()]);

  const missing = new Map<string, string[]>();
  try {
    for (const relay of pool.unreachable()) {
      missing.set(relay, idsByRelay.get(relay) ?? []);
    }
    for (const [relay, ids] of idsByRelay) {
      const client = pool.tryGet(relay);
      if (!client) {
        continue;
      }
      const found = await client.requestPointers({ ids });
      const foundIds = new Set(found.map(p => p.id));
      const absent = ids.filter(id => !foundIds.has(id));
      if (absent.length > 0) {
        missing.set(relay, [...(missing.get(relay) ?? []), ...absent]);
      }
      info(`Node ${relay}: ${ids.length - absent.length}/${ids.length} pointers present`);
    }
  } finally {
    pool.closeAll();
  }

  if (missing.size > 0) {
    for (const [relay, ids] of missing) {
      for (const id of ids) {
        console.error(`Missing pointer ${id} on node ${relay}`);
      }
    }
    throw new CLIError('Integrity check failed: pointers are missing', 3);
  }
  info(`Integrity check passed: all ${allIds.size} pointers present on their listed nodes`);
}
