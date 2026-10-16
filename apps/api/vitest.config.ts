import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `@/` 별칭은 tsconfig.json 의 paths(`@/*` → `src/*`)와 같게 둔다.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    passWithNoTests: true,
  },
});
