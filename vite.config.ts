import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/classroom/' : '/',
  build: { outDir: 'dist/classroom', emptyOutDir: true },
  server: { port: 4173 },
  preview: { port: 4174 },
}));
