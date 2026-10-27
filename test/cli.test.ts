import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { generatePrivateKey } from 'derby-tools';

const CLI_DIR = path.resolve(__dirname, '..');
const CLI = path.join(CLI_DIR, 'dist', 'cli.js');
const RELAY_DIR = path.resolve(CLI_DIR, '..', 'derby-storage-relay');
const RELAY_PORT = 18459;
const RELAY_URL = `ws://127.0.0.1:${RELAY_PORT}`;

let tempDir: string;
let relayProcess: ReturnType<typeof spawn>;

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): CliResult {
  const result = spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function startRelay(): void {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'derby-cli-test-'));
  const blobDir = path.join(tempDir, 'BlobData');
  fs.mkdirSync(blobDir);

  const filterGroupFile = path.join(tempDir, 'filter.json');
  fs.writeFileSync(filterGroupFile, JSON.stringify({
    default: {
      settings: {
        canpublish: true,
        canreplace: true,
        candelete: true,
        pointerexpiration: 0,
        maximumpointers: 1000,
        maximumpointerhashsize: 50000000,
      },
    },
  }));

  const filterKeysFile = path.join(tempDir, 'filterkeys.json');
  fs.writeFileSync(filterKeysFile, JSON.stringify({}));

  const ipFilterFile = path.join(tempDir, 'ipfilter.json');
  fs.writeFileSync(ipFilterFile, JSON.stringify({ block: [], safe: ['0.0.0.0/0'] }));

  const settingsFile = path.join(tempDir, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({
    server: { host: '127.0.0.1', port: RELAY_PORT, sessionTimeout: 30000, filteripfile: ipFilterFile },
    storage: { directory: blobDir, fileSuffix: 'blob', dataBlockLimit: 512000 },
    pointer: { timestampDelta: 300 },
    database: { type: 'sqlite', file: path.join(tempDir, 'pointers.db') },
    filter: { filtergroupfile: filterGroupFile, filterkeysfile: filterKeysFile },
    cache: { pointerCache: { pointerCacheTTL: 300, maxPointers: 10000 } },
  }));

  relayProcess = spawn('node', ['index.js'], {
    cwd: RELAY_DIR,
    env: { ...process.env, DERBY_SETTINGS: settingsFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relayProcess.stderr?.on('data', data => process.stderr.write('[relay] ' + data));
}

function waitForRelay(attemptsLeft = 50): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(RELAY_URL);
    socket.on('open', () => {
      socket.close();
      resolve();
    });
    socket.on('error', err => {
      if (attemptsLeft > 0) {
        setTimeout(() => waitForRelay(attemptsLeft - 1).then(resolve, reject), 300);
      } else {
        reject(err);
      }
    });
  });
}

beforeAll(async () => {
  if (!fs.existsSync(CLI)) {
    throw new Error('dist/cli.js not found - run `npm run build` first');
  }
  startRelay();
  await waitForRelay();
}, 30000);

afterAll(() => {
  try {
    relayProcess?.kill();
  } catch {
    // already gone
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

describe('derby CLI end-to-end', () => {
  const secretKey = generatePrivateKey();
  let testFile: string;
  let descriptorFile: string;

  it('1. uploads a multi-block file and writes a descriptor with merkleRoot', () => {
    testFile = path.join(tempDir, 'testfile.bin');
    // 5000 bytes at a 1024 block size => 5 blocks
    fs.writeFileSync(testFile, Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251)));
    descriptorFile = path.join(tempDir, 'descriptor.json');

    const result = runCli([
      'upload', testFile,
      '--storage-key', secretKey,
      '--nodes', RELAY_URL,
      '--block-size', '1024',
      '--mime-type', 'application/octet-stream',
      '--name', 'testfile.bin',
      '--descriptor-out', descriptorFile,
    ]);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(fs.existsSync(descriptorFile)).toBe(true);

    const raw = fs.readFileSync(descriptorFile, 'utf8');
    expect(raw).toContain('merkleRoot');
    expect(raw).not.toContain('merkelroot');
    const json = JSON.parse(raw);
    expect(json.datamap.length).toBe(5);
    expect(json.metadata.size).toBe(5000);
  });

  it('2. check passes with all pointers present', () => {
    const result = runCli(['check', descriptorFile]);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Integrity check passed');
  });

  it('3. downloads a byte-identical file', () => {
    const outFile = path.join(tempDir, 'downloaded.bin');
    const result = runCli(['download', descriptorFile, '--output', outFile]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(fs.readFileSync(outFile)).toEqual(fs.readFileSync(testFile));
  });

  it('3b. a legacy descriptor with the merkelroot misspelling still loads for download --info', () => {
    const json = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
    json.merkelroot = json.merkleRoot;
    delete json.merkleRoot;
    const legacyFile = path.join(tempDir, 'legacy-descriptor.json');
    fs.writeFileSync(legacyFile, JSON.stringify(json, undefined, 4));

    const result = runCli(['download', legacyFile, '--info']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Merkle Root Hash: ' + json.merkelroot);
  });

  it('4. refresh gives pointers new ids and check still passes', () => {
    const before = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
    const result = runCli(['refresh', descriptorFile, '--storage-key', secretKey]);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);

    const after = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
    const beforeIds = before.datamap.map((b: string[]) => b[0]);
    const afterIds = after.datamap.map((b: string[]) => b[0]);
    expect(afterIds).not.toEqual(beforeIds);
    expect(after.merkleRoot).toBe(before.merkleRoot);

    const check = runCli(['check', descriptorFile]);
    expect(check.code).toBe(0);
  });

  it('4b. refresh --data re-uploads the file contents', () => {
    const result = runCli(['refresh', descriptorFile, '--storage-key', secretKey, '--data', testFile]);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);

    const check = runCli(['check', descriptorFile]);
    expect(check.code).toBe(0);
  });

  it('4c. refresh --data rejects a file that does not match the descriptor', () => {
    const wrongFile = path.join(tempDir, 'wrong.bin');
    fs.writeFileSync(wrongFile, Buffer.alloc(5000, 7));
    const result = runCli(['refresh', descriptorFile, '--storage-key', secretKey, '--data', wrongFile]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('hash mismatch');
  });

  it('5. delete removes the pointers and check then exits 3', () => {
    const del = runCli(['delete', descriptorFile, '--storage-key', secretKey]);
    expect(del.stderr).toBe('');
    expect(del.code).toBe(0);

    const check = runCli(['check', descriptorFile]);
    expect(check.code).toBe(3);
    expect(check.stderr).toContain('Missing pointer');
  });

  it('6. descriptor to-event / from-event round-trips', () => {
    const eventFile = path.join(tempDir, 'event.json');
    const toResult = runCli([
      'descriptor', 'to-event', descriptorFile,
      '--nostr-key', secretKey,
      '--event-out', eventFile,
      '--test-run',
    ]);
    expect(toResult.code).toBe(0);
    expect(toResult.stdout).toContain('NAddress: naddr1');
    expect(fs.existsSync(eventFile)).toBe(true);

    const outDescriptor = path.join(tempDir, 'roundtrip-descriptor.json');
    const fromResult = runCli([
      'descriptor', 'from-event',
      '--event-file', eventFile,
      '--descriptor-out', outDescriptor,
    ]);
    expect(fromResult.code).toBe(0);

    const original = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
    const roundTripped = JSON.parse(fs.readFileSync(outDescriptor, 'utf8'));
    expect(roundTripped.merkleRoot).toBe(original.merkleRoot);
    expect(roundTripped.datamap).toEqual(original.datamap);
    expect(roundTripped.metadata.size).toBe(original.metadata.size);
  });

  it('7. keys generate and convert handle hex/nsec/dsec/npub/derby1', () => {
    const gen = runCli(['keys', 'generate']);
    expect(gen.code).toBe(0);
    expect(gen.stdout).toContain('Secret Key (hex):');
    expect(gen.stdout).toContain('Secret Key (nsec): nsec1');
    expect(gen.stdout).toContain('Secret Key (dsec): dsec1');
    expect(gen.stdout).toContain('Public Key (derby): derby1');
    expect(gen.stdout).toContain('Public Key (npub): npub1');

    const hex = /Secret Key \(hex\): ([0-9a-f]{64})/.exec(gen.stdout)?.[1]!;
    const nsec = /Secret Key \(nsec\): (nsec1\S+)/.exec(gen.stdout)?.[1]!;
    const dsec = /Secret Key \(dsec\): (dsec1\S+)/.exec(gen.stdout)?.[1]!;
    const npub = /Public Key \(npub\): (npub1\S+)/.exec(gen.stdout)?.[1]!;
    const derby = /Public Key \(derby\): (derby1\S+)/.exec(gen.stdout)?.[1]!;
    const pubHex = /Public Key \(hex\): ([0-9a-f]{64})/.exec(gen.stdout)?.[1]!;

    for (const input of [hex, nsec, dsec]) {
      const convert = runCli(['keys', 'convert', input]);
      expect(convert.code).toBe(0);
      expect(convert.stdout).toContain('Secret Key (hex): ' + hex);
      expect(convert.stdout).toContain('Public Key (hex): ' + pubHex);
      expect(convert.stdout).toContain('Public Key (derby): ' + derby);
    }

    for (const input of [npub, derby]) {
      const convert = runCli(['keys', 'convert', input]);
      expect(convert.code).toBe(0);
      expect(convert.stdout).not.toContain('Secret Key');
      expect(convert.stdout).toContain('Public Key (hex): ' + pubHex);
    }

    const bad = runCli(['keys', 'convert', 'notakey']);
    expect(bad.code).toBe(1);
  });

  it('rejects an unknown secret key format on upload', () => {
    const result = runCli([
      'upload', testFile,
      '--storage-key', 'notakey',
      '--nodes', RELAY_URL,
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('error:');
  });
});
