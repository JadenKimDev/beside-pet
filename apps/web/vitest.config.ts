import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `@/` 별칭은 tsconfig.json 의 paths(`@/*` → `./*`)와 같게 둔다.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**'],
    passWithNoTests: true,
  },
});
