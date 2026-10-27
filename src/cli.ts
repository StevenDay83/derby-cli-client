import { Command, Option } from 'commander';
import { ProtocolError } from 'derby-tools';
import { CLIError } from './errors.js';
import { setVerbose } from './progress.js';
import { uploadCommand } from './commands/upload.js';
import { downloadCommand } from './commands/download.js';
import { checkCommand } from './commands/check.js';
import { deleteCommand } from './commands/delete.js';
import { refreshCommand } from './commands/refresh.js';
import { descriptorFromEventCommand, descriptorToEventCommand } from './commands/descriptor.js';
import { keysConvertCommand, keysGenerateCommand } from './commands/keys.js';

const program = new Command();

program
  .name('derby')
  .description('Derby File Storage command line client')
  .version('1.0.0')
  .option('--verbose', 'verbose debug output')
  .option('--ignore-ssl-errors', 'disable TLS certificate verification')
  .hook('preAction', thisCommand => {
    const opts = thisCommand.opts();
    setVerbose(!!opts.verbose);
    if (opts.ignoreSslErrors) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
  });

program
  .command('upload')
  .description('Upload a file to one or more storage nodes')
  .argument('<file>', 'file to upload')
  .requiredOption('--storage-key <key>', 'secret key (nsec1..., dsec1..., or 64-char hex)')
  .requiredOption('--nodes <urls>', 'comma-separated storage node URLs (wss://a,wss://b)')
  .option('--block-size <bytes>', 'block size in bytes (min 1000)', '512000')
  .option('--mime-type <type>', 'content MIME type')
  .option('--name <label>', 'file label stored in the descriptor')
  .option('--descriptor-out <file|stdout>', 'descriptor output path', undefined)
  .action(async (file: string, options: any) => {
    await uploadCommand(file, options);
  });

program
  .command('download')
  .description('Download a file described by a data descriptor')
  .argument('<descriptor>', 'descriptor file path or nostr:naddr1...')
  .option('--output <file>', 'output file path')
  .option('--info', 'print descriptor information only')
  .action(async (source: string, options: any) => {
    await downloadCommand(source, options);
  });

program
  .command('check')
  .description('Verify every pointer in a descriptor exists on its listed storage nodes')
  .argument('<descriptor>', 'descriptor file path or nostr:naddr1...')
  .action(async (source: string) => {
    await checkCommand(source);
  });

program
  .command('delete')
  .description('Delete every pointer in a descriptor from its listed storage nodes')
  .argument('<descriptor>', 'descriptor file path or nostr:naddr1...')
  .requiredOption('--storage-key <key>', 'secret key (nsec1..., dsec1..., or 64-char hex)')
  .action(async (source: string, options: any) => {
    await deleteCommand(source, options);
  });

program
  .command('refresh')
  .description('Re-publish every pointer in a descriptor with a fresh timestamp')
  .argument('<descriptor>', 'descriptor file path or nostr:naddr1...')
  .requiredOption('--storage-key <key>', 'secret key (nsec1..., dsec1..., or 64-char hex)')
  .option('--data <file>', 'original data file, re-uploaded with the refreshed pointers')
  .option('--descriptor-out <file|stdout>', 'where to write the updated descriptor (default: update file source in place, stdout for nostr sources)')
  .action(async (source: string, options: any) => {
    await refreshCommand(source, options);
  });

const descriptor = program
  .command('descriptor')
  .description('Convert data descriptors to and from nostr events');

descriptor
  .command('to-event')
  .description('Convert a descriptor file to a signed nostr event')
  .argument('<descriptor-file>', 'descriptor file path')
  .requiredOption('--nostr-key <key>', 'nostr secret key (nsec1... or 64-char hex)')
  .option('--event-out <file|stdout>', 'write the event JSON to a file or stdout')
  .option('--publish <urls>', 'comma-separated nostr relays to publish to')
  .option('--test-run', 'do everything except publish; just print the naddr')
  .action(async (file: string, options: any) => {
    await descriptorToEventCommand(file, options);
  });

descriptor
  .command('from-event')
  .description('Rebuild a data descriptor from a nostr event')
  .addOption(new Option('--naddr <naddr1...>', 'nostr address of the descriptor event').conflicts('eventFile'))
  .addOption(new Option('--event-file <file>', 'read the event JSON from a file').conflicts('naddr'))
  .option('--descriptor-out <file|stdout>', 'descriptor output path', 'stdout')
  .action(async (options: any) => {
    await descriptorFromEventCommand(options);
  });

const keys = program
  .command('keys')
  .description('Derby/nostr key utilities');

keys
  .command('generate')
  .description('Generate a new key pair and print every representation')
  .action(() => {
    keysGenerateCommand();
  });

keys
  .command('convert')
  .description('Show all representations of a key (hex, nsec/npub, derby1/dsec1)')
  .argument('<key>', 'key in any supported format')
  .action((key: string) => {
    keysConvertCommand(key);
  });

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (e) {
    if (e instanceof CLIError) {
      console.error('error: ' + e.message);
      process.exit(e.exitCode);
    }
    if (e instanceof ProtocolError) {
      console.error('error: ' + e.message);
      process.exit(2);
    }
    console.error('error: ' + (e as Error).message);
    process.exit(1);
  }
}

main();
