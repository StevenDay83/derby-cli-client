import { describeKey, generateKeyReport, printKeyReport } from '../keys.js';
import { info } from '../progress.js';

export function keysGenerateCommand(): void {
  info('Generating Key Pair\n');
  info('NOTE: Please save this key pair in a safe place.');
  info('Your public key will be your identity on storage nodes and can be distributed.');
  info('Your secret key is used for uploading and managing data. DO NOT SHARE IT.\n');
  printKeyReport(generateKeyReport());
}

export function keysConvertCommand(key: string): void {
  printKeyReport(describeKey(key));
}
