import { defineConfig } from 'vitest/config';

/**
 * Tests de servidor de `apps/web`. No comparten configuración con los de `@gdc/core`
 * porque no comparten requisitos: los del motor son puros y corren en cualquier sitio;
 * estos necesitan un Postgres levantado y por eso viven en su propio comando
 * (`npm run test:security`).
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Levanta el clúster efímero y aplica shim + migraciones antes de nada.
    globalSetup: ['../../tools/pg/harness.mjs'],
    // `initdb` la primera vez tarda unos segundos.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // Cada consulta abre su propio `psql`: en paralelo se pisarían el seed compartido.
    fileParallelism: false,
  },
});
