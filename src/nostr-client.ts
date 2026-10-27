import WebSocket from 'ws';
import { nip19, verifyEvent, type NostrEvent } from 'nostr-tools';
import { protocolError, usageError } from './errors.js';

export const DEFAULT_NOSTR_RELAYS = ['wss://relay.damus.io', 'wss://nostr.mom'];
const NOSTR_TIMEOUT_MS = 15000;

function openSocket(relayURL: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relayURL);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Timed out connecting to ' + relayURL));
    }, timeoutMs);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

interface NAddrData {
  pubkey: string;
  kind: number;
  identifier: string;
  relays?: string[];
}

export function decodeNAddr(naddr: string): NAddrData {
  if (!naddr || !naddr.startsWith('naddr1')) {
    throw usageError('Invalid nostr address (expected naddr1...)');
  }
  try {
    const decoded = nip19.decode(naddr);
    if (decoded.type !== 'naddr') {
      throw new Error('not an naddr');
    }
    return decoded.data as NAddrData;
  } catch (e) {
    throw usageError('Invalid nostr address: ' + (e as Error).message);
  }
}

// Queries every relay (from the naddr hints, or the defaults) for the
// addressed event and resolves with the newest verified event found.
export function fetchEventByNAddr(naddr: string, timeoutMs = NOSTR_TIMEOUT_MS): Promise<NostrEvent> {
  const data = decodeNAddr(naddr);
  const relayList = data.relays && data.relays.length > 0 ? data.relays : DEFAULT_NOSTR_RELAYS;
  const filter = {
    authors: [data.pubkey],
    kinds: [data.kind],
    '#d': [data.identifier],
  };

  return new Promise((resolve, reject) => {
    const events: NostrEvent[] = [];
    let finishedRelays = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        finish();
      }
    }, timeoutMs);

    const finish = () => {
      clearTimeout(timer);
      events.sort((a, b) => b.created_at - a.created_at);
      const newest = events[0];
      if (newest) {
        resolve(newest);
      } else {
        reject(protocolError('Descriptor event not found on any nostr relay for ' + naddr.slice(0, 24) + '...'));
      }
    };

    const relayDone = () => {
      finishedRelays++;
      if (finishedRelays === relayList.length && !settled) {
        settled = true;
        finish();
      }
    };

    for (const relayURL of relayList) {
      const done = relayDoneOnce(relayDone);
      openSocket(relayURL, timeoutMs).then(ws => {
        ws.on('message', (raw: WebSocket.RawData) => {
          let response: unknown[];
          try {
            response = JSON.parse(raw.toString());
          } catch {
            return;
          }
          if (!Array.isArray(response) || response.length === 0) {
            return;
          }
          if (response[0] === 'EVENT') {
            const event = response[2] as NostrEvent;
            try {
              if (verifyEvent(event)) {
                events.push(event);
              }
            } catch {
              // ignore malformed events
            }
          } else if (response[0] === 'EOSE') {
            ws.close();
            done();
          }
        });
        ws.on('close', done);
        ws.on('error', done);
        ws.send(JSON.stringify(['REQ', Math.floor(Date.now() / 1000).toString(), filter]));
      }).catch(done);
    }
  });
}

function relayDoneOnce(fn: () => void): () => void {
  let called = false;
  return () => {
    if (!called) {
      called = true;
      fn();
    }
  };
}

// Publishes the event to every relay; resolves with per-relay results once
// each relay has acknowledged (OK) or failed.
export async function publishEventToRelays(
  event: NostrEvent,
  relays?: string[],
  timeoutMs = NOSTR_TIMEOUT_MS,
): Promise<{ relay: string; ok: boolean; message: string }[]> {
  const relayList = relays && relays.length > 0 ? relays : DEFAULT_NOSTR_RELAYS;
  return Promise.all(relayList.map(async relayURL => {
    try {
      const ws = await openSocket(relayURL, timeoutMs);
      const result = await new Promise<{ ok: boolean; message: string }>(resolve => {
        const timer = setTimeout(() => {
          ws.close();
          resolve({ ok: false, message: 'timeout' });
        }, timeoutMs);
        ws.on('message', (raw: WebSocket.RawData) => {
          let response: unknown[];
          try {
            response = JSON.parse(raw.toString());
          } catch {
            return;
          }
          if (Array.isArray(response) && response[0] === 'OK' && response[1] === event.id) {
            clearTimeout(timer);
            ws.close();
            resolve({ ok: response[2] === true, message: String(response[3] ?? '') });
          }
        });
        ws.send(JSON.stringify(['EVENT', event]));
      });
      return { relay: relayURL, ...result };
    } catch (e) {
      return { relay: relayURL, ok: false, message: (e as Error).message };
    }
  }));
}
