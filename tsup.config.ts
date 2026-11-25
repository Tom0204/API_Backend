import { defineConfig } from 'tsup'

// Build de production : un seul fichier CommonJS, dist/server.cjs. Les dépendances de package.json
// (dont argon2, module natif) restent externes et sont chargées depuis node_modules.
export default defineConfig({
    entry: { server: 'src/main.ts' },
    format: ['cjs'],
    platform: 'node',
    target: 'node22',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    splitting: false,
    shims: true
})
