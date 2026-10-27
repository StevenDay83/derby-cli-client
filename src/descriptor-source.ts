import fs from 'node:fs';
import { DataDescriptor, importDescriptorFromEvent, type DescriptorJSON } from 'derby-tools';
import { fetchEventByNAddr } from './nostr-client.js';
import { usageError } from './errors.js';

export interface LoadedDescriptor {
  descriptor: DataDescriptor;
  // Absolute-ish source string as passed in; filePath set only for file sources.
  source: string;
  filePath?: string;
}

// Shared loader for download/check/delete/refresh: accepts a descriptor file
// path or `nostr:naddr1...`.
export async function loadDescriptor(source: string): Promise<LoadedDescriptor> {
  if (!source) {
    throw usageError('A descriptor file path or nostr:naddr1... source is required');
  }
  if (source.toLowerCase().startsWith('nostr:')) {
    const parts = source.split(':');
    if (parts.length !== 2 || !parts[1]) {
      throw usageError('Invalid nostr descriptor source (expected nostr:naddr1...)');
    }
    const event = await fetchEventByNAddr(parts[1]);
    return { descriptor: importDescriptorFromEvent(event), source };
  }
  if (!fs.existsSync(source)) {
    throw usageError('Descriptor file not found: ' + source);
  }
  let json: DescriptorJSON;
  try {
    json = JSON.parse(fs.readFileSync(source, 'utf8'));
  } catch (e) {
    throw usageError('Could not parse descriptor file: ' + (e as Error).message);
  }
  const descriptor = new DataDescriptor();
  descriptor.importDescriptor(json);
  return { descriptor, source, filePath: source };
}

// Serializes a descriptor back to JSON. When the source was a file and no
// explicit output is given, the file is updated in place.
export function writeDescriptor(descriptor: DataDescriptor, out: string | undefined, fallbackFile?: string): void {
  const json = JSON.stringify(descriptor.generateDataDescriptorJSON(), undefined, 4);
  const target = out ?? fallbackFile;
  if (!target || target.toLowerCase() === 'stdout') {
    console.log(json);
  } else {
    fs.writeFileSync(target, json);
    console.log('Descriptor written to ' + target);
  }
}
