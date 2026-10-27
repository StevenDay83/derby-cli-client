import { nip19 } from 'nostr-tools';
import {
  decodeNetworkPrivateKey,
  decodeNetworkPublicKey,
  encodeNetworkPrivateKey,
  encodeNetworkPublicKey,
  generatePrivateKey,
  getPublicKey,
  isEncodedPrivateKey,
  isEncodedPublicKey,
} from 'derby-tools';
import { usageError } from './errors.js';

const HEX_64 = /^[0-9a-fA-F]{64}$/;

export function isHexKey(value: string): boolean {
  return HEX_64.test(value);
}

// Accepts nsec1..., dsec1..., or 64-char hex. Returns the hex secret key.
export function resolveSecretKey(input: string): string {
  if (!input) {
    throw usageError('Empty secret key');
  }
  if (input.startsWith('nsec1')) {
    try {
      const decoded = nip19.decode(input);
      if (decoded.type === 'nsec') {
        return Buffer.from(decoded.data).toString('hex');
      }
    } catch {
      // fall through to error
    }
    throw usageError('Invalid nsec key');
  }
  if (isEncodedPrivateKey(input)) {
    try {
      return decodeNetworkPrivateKey(input);
    } catch (e) {
      throw usageError('Invalid dsec key: ' + (e as Error).message);
    }
  }
  if (isHexKey(input)) {
    return input.toLowerCase();
  }
  throw usageError('Unrecognized secret key format (expected nsec1..., dsec1..., or 64-char hex)');
}

// Accepts nsec1... or 64-char hex (nostr signing keys).
export function resolveNostrSecretKey(input: string): string {
  if (input && input.startsWith('nsec1')) {
    return resolveSecretKey(input);
  }
  if (input && isHexKey(input)) {
    return input.toLowerCase();
  }
  throw usageError('Unrecognized nostr key format (expected nsec1... or 64-char hex)');
}

export interface KeyReport {
  secretKeyHex?: string;
  nsec?: string;
  dsec?: string;
  publicKeyHex: string;
  npub: string;
  derby: string;
}

// Accepts any of hex (treated as a secret key), nsec, npub, derby1, dsec1 and
// produces every representation derivable from it.
export function describeKey(input: string): KeyReport {
  if (!input) {
    throw usageError('Empty key');
  }
  if (input.startsWith('nsec1') || isEncodedPrivateKey(input) || isHexKey(input)) {
    const secretKeyHex = resolveSecretKey(input);
    const publicKeyHex = getPublicKey(secretKeyHex);
    return {
      secretKeyHex,
      nsec: nip19.nsecEncode(new Uint8Array(Buffer.from(secretKeyHex, 'hex'))),
      dsec: encodeNetworkPrivateKey(secretKeyHex),
      publicKeyHex,
      npub: nip19.npubEncode(publicKeyHex),
      derby: encodeNetworkPublicKey(publicKeyHex),
    };
  }
  if (input.startsWith('npub1')) {
    let publicKeyHex: string;
    try {
      const decoded = nip19.decode(input);
      if (decoded.type !== 'npub') {
        throw new Error('not an npub');
      }
      publicKeyHex = decoded.data as string;
    } catch {
      throw usageError('Invalid npub key');
    }
    return {
      publicKeyHex,
      npub: input,
      derby: encodeNetworkPublicKey(publicKeyHex),
    };
  }
  if (isEncodedPublicKey(input)) {
    let publicKeyHex: string;
    try {
      publicKeyHex = decodeNetworkPublicKey(input);
    } catch (e) {
      throw usageError('Invalid derby key: ' + (e as Error).message);
    }
    return {
      publicKeyHex,
      npub: nip19.npubEncode(publicKeyHex),
      derby: input,
    };
  }
  throw usageError('Unrecognized key format (expected hex, nsec1, npub1, derby1, or dsec1)');
}

export function printKeyReport(report: KeyReport): void {
  if (report.secretKeyHex) {
    console.log('Secret Key (hex): ' + report.secretKeyHex);
    console.log('Secret Key (nsec): ' + report.nsec);
    console.log('Secret Key (dsec): ' + report.dsec);
  }
  console.log('Public Key (hex): ' + report.publicKeyHex);
  console.log('Public Key (npub): ' + report.npub);
  console.log('Public Key (derby): ' + report.derby);
}

export function generateKeyReport(): KeyReport {
  return describeKey(generatePrivateKey());
}
