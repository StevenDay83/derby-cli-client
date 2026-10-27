import { DerbyClient } from 'derby-tools';
import { protocolError } from './errors.js';

// Connects to each relay once and hands out shared clients. Callers must call
// closeAll() when done so sockets don't keep the process alive.
export class RelayPool {
  private clients = new Map<string, DerbyClient>();
  private failures = new Map<string, Error>();

  async connectAll(relayURLs: string[]): Promise<void> {
    await Promise.all(relayURLs.map(async url => {
      const client = new DerbyClient(url);
      try {
        await client.connect();
        this.clients.set(url, client);
      } catch (e) {
        this.failures.set(url, e as Error);
      }
    }));
  }

  get(url: string): DerbyClient {
    const client = this.clients.get(url);
    if (!client) {
      const failure = this.failures.get(url);
      throw protocolError(`Storage node ${url} is unreachable${failure ? ': ' + failure.message : ''}`);
    }
    return client;
  }

  tryGet(url: string): DerbyClient | undefined {
    return this.clients.get(url);
  }

  unreachable(): string[] {
    return [...this.failures.keys()];
  }

  closeAll(): void {
    for (const client of this.clients.values()) {
      client.close();
    }
  }
}
