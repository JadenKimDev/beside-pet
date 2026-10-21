import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `@/` 별칭은 tsconfig.json 의 paths(`@/*` → `./*`)와 같게 둔다.
export default defineConfig({
  // 캐시를 패키지 안에 둔다. 루트 node_modules/.vite 를 같이 쓰면 pnpm -r test 가 두 앱을 함께 돌릴 때 서로 지워 ENOTEMPTY 가 난다.
  cacheDir: fileURLToPath(new URL('./node_modules/.vite', import.meta.url)),
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
