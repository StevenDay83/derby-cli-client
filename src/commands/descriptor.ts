import fs from 'node:fs';
import {
  createEventFromDataDescriptor,
  DataDescriptor,
  getNAddrFromEvent,
  importDescriptorFromEvent,
} from 'derby-tools';
import type { NostrEvent } from 'nostr-tools';
import { loadDescriptor, writeDescriptor } from '../descriptor-source.js';
import { resolveNostrSecretKey } from '../keys.js';
import { DEFAULT_NOSTR_RELAYS, fetchEventByNAddr, publishEventToRelays } from '../nostr-client.js';
import { usageError } from '../errors.js';
import { info } from '../progress.js';

export interface ToEventOptions {
  nostrKey: string;
  eventOut?: string;
  publish?: string;
  testRun?: boolean;
}

export async function descriptorToEventCommand(descriptorFile: string, options: ToEventOptions): Promise<void> {
  const secretKey = resolveNostrSecretKey(options.nostrKey);
  const { descriptor } = await loadDescriptor(descriptorFile);

  const event = createEventFromDataDescriptor(descriptor, secretKey);

  if (options.eventOut) {
    const json = JSON.stringify(event, undefined, 4);
    if (options.eventOut.toLowerCase() === 'stdout') {
      console.log(json);
    } else {
      fs.writeFileSync(options.eventOut, json);
      info('Event written to ' + options.eventOut);
    }
  }

  const publishRelays = options.publish
    ? options.publish.split(',').map(s => s.trim()).filter(Boolean)
    : undefined;

  if (options.testRun) {
    const naddr = getNAddrFromEvent(event, publishRelays ?? DEFAULT_NOSTR_RELAYS);
    info('NAddress: ' + naddr);
    return;
  }

  if (publishRelays && publishRelays.length > 0) {
    info('Publishing to relays: ' + publishRelays.join(', '));
    const results = await publishEventToRelays(event, publishRelays);
    for (const result of results) {
      if (result.ok) {
        info(`Relay ${result.relay}: published`);
      } else {
        console.error(`Relay ${result.relay}: publish failed (${result.message})`);
      }
    }
  }

  const naddr = getNAddrFromEvent(event, publishRelays ?? DEFAULT_NOSTR_RELAYS);
  info('NAddress: ' + naddr);
}

export interface FromEventOptions {
  naddr?: string;
  eventFile?: string;
  descriptorOut?: string;
}

export async function descriptorFromEventCommand(options: FromEventOptions): Promise<void> {
  let event: NostrEvent;
  if (options.eventFile) {
    let parsed: NostrEvent;
    try {
      parsed = JSON.parse(fs.readFileSync(options.eventFile, 'utf8'));
    } catch (e) {
      throw usageError('Could not parse event file: ' + (e as Error).message);
    }
    event = parsed;
  } else if (options.naddr) {
    event = await fetchEventByNAddr(options.naddr);
  } else {
    throw usageError('One of --naddr or --event-file is required');
  }

  const descriptor: DataDescriptor = importDescriptorFromEvent(event);
  writeDescriptor(descriptor, options.descriptorOut ?? 'stdout');
}
