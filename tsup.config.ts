import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bin/lazybrain': 'bin/lazybrain.ts',
    'bin/hook': 'bin/hook.ts',
    'bin/statusline': 'bin/statusline.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  splitting: false,
  shims: true,
});
