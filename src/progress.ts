let verbose = false;

export function setVerbose(flag: boolean): void {
  verbose = flag;
}

export function isVerbose(): boolean {
  return verbose;
}

export function debug(message: string): void {
  if (verbose) {
    console.error('[debug] ' + message);
  }
}

export function info(message: string): void {
  console.log(message);
}

export function progressLine(message: string): void {
  console.log(message);
}
