import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Build multiple entry points - one for each app in src/apps/
const input = {
    index: path.resolve(__dirname, 'index.html'),
    shoreline: path.resolve(__dirname, 'apps/shoreline/index.html'),
    hose_planner: path.resolve(__dirname, 'apps/hose-planner/index.html'),
};

export default defineConfig({
    base: '/apps/',
    build: {
        rollupOptions: {
            input,
            output: {
                entryFileNames: '[name].js',
            },
        },
        outDir: 'dist',
        emptyOutDir: true,
    },
});
