import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['cjs'],
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  sourcemap: false,
  dts: false,
});
