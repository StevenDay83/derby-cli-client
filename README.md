# derby-cli

Derby storage network command-line client, rewritten in TypeScript on top of
[derby-tools](https://github.com/StevenDay83/derby-tools) v2.

## Install / Build

```sh
npm install
npm run build        # tsup -> dist/cli.js (entry point for the `derby` bin)
npm test             # builds, then runs the vitest integration suite
npm run build:binaries  # requires bun: compiles standalone binaries into dist/bin/
```

Standalone binaries (macOS arm64/x64, Linux x64, Windows x64) are produced with
`bun build --compile` via `npm run build:binaries`.

## Usage

```
derby upload    <file> --storage-key <nsec|dsec|hex> --nodes <wss://a,wss://b>
                [--block-size <bytes>] [--mime-type <type>] [--name <label>]
                [--descriptor-out <file|stdout>]
derby download  <descriptor-file|nostr:naddr1...> [--output <file>] [--info]
derby check     <descriptor-file|nostr:naddr1...>
derby delete    <descriptor-file|nostr:naddr1...> --storage-key <key>
derby refresh   <descriptor-file|nostr:naddr1...> --storage-key <key> [--data <file>]
                [--descriptor-out <file|stdout>]
derby descriptor to-event   <descriptor-file> --nostr-key <nsec|hex>
                [--event-out <file|stdout>] [--publish <wss://relay,...>] [--test-run]
derby descriptor from-event (--naddr <naddr1...> | --event-file <file>)
                [--descriptor-out <file|stdout>]
derby keys      generate | convert <key>
```

Global options: `--verbose` (debug output), `--ignore-ssl-errors` (disables TLS
certificate verification — not recommended). Every subcommand has `--help`.

Exit codes: `0` success, `1` usage/IO error, `2` protocol/network error,
`3` integrity check found missing pointers (`check` only).

### Keys

`--storage-key` auto-detects `nsec1...` (nostr), `dsec1...` (derby bech32m), or
a raw 64-character hex secret key.

`derby keys generate` creates a new key pair and prints every representation:
hex/nsec/dsec secret keys and hex/npub/derby1 public keys.
`derby keys convert <key>` shows all representations derivable from any
supported key (public-key inputs naturally omit the secret forms).

### Descriptor sources

`download`, `check`, `delete`, and `refresh` all accept either a descriptor
JSON file path or `nostr:naddr1...`, in which case the descriptor event is
fetched from the naddr's relay hints (falling back to `wss://relay.damus.io`
and `wss://nostr.mom`).

### Upload

Uploads a file, chunked into blocks (default 512000 bytes, minimum 1000), to
every listed storage node, then writes a data descriptor JSON (default
`<file>.derby.json`, or `stdout`). The descriptor uses the corrected
`merkleRoot` spelling; legacy descriptors written with the old `merkelroot`
misspelling still load.

If `--mime-type` is omitted, the MIME type is detected from the file's magic
numbers (via the `file-type` package, reading only the first ~4 KB); unknown
binary data falls back to `application/octet-stream`. An explicit `--mime-type`
always wins over detection.

```sh
derby upload bitcoin.pdf \
  --storage-key dsec1... \
  --nodes ws://localhost:8080 \
  --block-size 1000000 --mime-type application/pdf --name bitcoin.pdf \
  --descriptor-out bitcoin.pdf.map.json
```

### Download

```sh
derby download bitcoin.pdf.map.json [--output bitcoin.pdf]
derby download nostr:naddr1... --info   # human-readable descriptor summary
```

Without `--output`, the file label from the descriptor is used (falling back to
`<merkleRoot>.file`). `--info` prints the descriptor summary (file label, size,
Merkle root, block count, storage node list) without downloading.

### Check

Verifies that every pointer in the descriptor's blob map exists on each relay
listed for its block (`REQUEST` by pointer id, grouped per relay). Reports any
missing pointers per node and exits `3` if any are missing. Assumption: a
pointer that exists implies its data exists.

### Delete

Builds a spec-compliant deletion pointer for each block — same pubkey,
pointerhash, and size as the target; a nonce in 0–8 that differs from the
existing pointer's nonce; a timestamp strictly newer than the existing
pointer's — signs it, and sends `POINTER/DELETE` to every relay listed for the
block. Per-node results are reported; any failure exits `2`.

### Refresh

Re-publishes each pointer with a fresh timestamp and a random nonce ≥ 10 so
relays replace the stored pointer (per spec, same pubkey + pointerhash + size
updates a pointer). Pointer ids change, so the descriptor is updated: in place
when the source was a file (or to `--descriptor-out` / stdout).

Without `--data`, only pointers are re-published — a relay that lost the blob
data will reject the refresh, which is reported. With `--data <file>`, the file
is re-split along the descriptor's block sizes, each block's hash is verified
against the descriptor (a mismatch aborts with a clear error), and the data is
re-uploaded with the refreshed pointers.

### Nostr descriptor events

`derby descriptor to-event` converts a descriptor to a signed nostr event
(kind 37337) and prints its `naddr1...` address. `--test-run` skips publishing.
`--publish wss://relay,...` publishes to those relays (defaults:
`wss://relay.damus.io`, `wss://nostr.mom`).

`derby descriptor from-event` rebuilds a descriptor from an event file
(`--event-file`) or by fetching an `--naddr` from nostr relays.

## Development status

This is in very early development. Things WILL break. Do not use it for any
data you care about or in production.

For issues please submit on GitHub or reach out on Nostr:
[npub1pwtrrydty95q5ces0tkm2r7hkqfe9jwxhmmee5xwke6g4lz70l7sd8pf5t](https://snort.social/nprofile1qqsqh933jx4jz6q2vvc84md4pltmqyuje8rtaauu6r8tvay2l308llgpzemhxue69uhk2er9dchxummnw3ezumrpdejz7qgewaehxw309amk2mrrdakk2tnwdaehgu3wwa5kuef0qyg8wumn8ghj7mn0wd68ytnddakj7wmd2x9)
