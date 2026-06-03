import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Build multiple entry points - one for each app in src/apps/
const input = {
    index: path.resolve(__dirname, 'src/index.html'),
    shoreline: path.resolve(__dirname, 'src/apps/shoreline/index.html'),
};

export default defineConfig({
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
