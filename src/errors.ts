export class CLIError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'CLIError';
    this.exitCode = exitCode;
  }
}

export function usageError(message: string): CLIError {
  return new CLIError(message, 1);
}

export function protocolError(message: string): CLIError {
  return new CLIError(message, 2);
}
