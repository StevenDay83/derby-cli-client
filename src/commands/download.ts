import fs from 'node:fs';
import path from 'node:path';
import { DataDescriptor, DerbyClient, DownloadTransferManager, type DownloadProgress } from 'derby-tools';
import { loadDescriptor } from '../descriptor-source.js';
import { protocolError } from '../errors.js';
import { info, progressLine } from '../progress.js';

export interface DownloadOptions {
  output?: string;
  info?: boolean;
}

export function displayDescriptorInfo(descriptor: DataDescriptor): void {
  const size = descriptor.metadata.size;
  let totalSizeString: string;
  if (size >= 1000 && size < 1000000) {
    totalSizeString = Math.ceil(size / 1000).toString() + ' KB';
  } else if (size >= 1000000 && size < 1000000000) {
    totalSizeString = Math.ceil(size / 1000000).toString() + ' MB';
  } else if (size >= 1000000000) {
    totalSizeString = Math.ceil(size / 1000000000).toString() + ' GB';
  } else {
    totalSizeString = size.toString() + ' Bytes';
  }

  const downloader = new DownloadTransferManager();
  downloader.setDataDescriptor(descriptor);
  const relayList = downloader.getListOfRelays();

  const numberOfBlocks = descriptor.blobMap.length;
  console.log('\nData Descriptor Information\n');
  console.log('-------------------------\n');
  console.log('File Label: ' + (descriptor.metadata.filename ? descriptor.metadata.filename : 'Not Specified'));
  console.log('Total Size: ' + totalSizeString);
  console.log('Streamable Content: ' + (descriptor.metadata.streamable ? 'Yes' : 'No'));
  console.log('Content Type: ' + (descriptor.metadata.mimetype ? descriptor.metadata.mimetype : 'Not Specified'));
  console.log('Merkle Root Hash: ' + descriptor.merkleRoot);
  console.log('Number of Data Blocks: ' + numberOfBlocks);
  console.log('Average Block Size: ' + Math.floor(size / numberOfBlocks).toString() + ' Bytes');
  console.log('Total Storage Node List:\n' + relayList.map(r => '\t' + r).join('\n'));
}

export async function downloadCommand(source: string, options: DownloadOptions): Promise<void> {
  const { descriptor } = await loadDescriptor(source);

  if (options.info) {
    displayDescriptorInfo(descriptor);
    return;
  }

  let outputFile = options.output;
  if (!outputFile) {
    const label = descriptor.metadata.filename;
    if (label) {
      outputFile = path.basename(label);
    }
  }
  if (!outputFile) {
    outputFile = descriptor.merkleRoot + '.file';
  }

  const pool: DerbyClient[] = [];
  const downloader = new DownloadTransferManager(async (relayURL: string) => {
    const client = new DerbyClient(relayURL);
    await client.connect();
    pool.push(client);
    return client;
  });
  downloader.setDataDescriptor(descriptor);
  info('Storage nodes listed for download: ' + downloader.getListOfRelays().join(', '));

  let data: Uint8Array;
  try {
    data = await downloader.download((progress: DownloadProgress) => {
      const pct = Math.ceil((progress.completedBlocks / progress.totalBlocks) * 100);
      progressLine(`${pct}% Complete - Block ${progress.blockIndex} (${progress.blockSize} bytes) downloaded`);
    });
  } catch (e) {
    throw protocolError('Download failed: ' + (e as Error).message);
  } finally {
    for (const client of pool) {
      client.close();
    }
  }

  fs.writeFileSync(outputFile, data);
  info(`Download completed: ${data.length} bytes saved to ${outputFile}`);
}
