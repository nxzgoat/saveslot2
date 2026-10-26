import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE é definido no deploy do GitHub Pages (ex.: /nome-do-repositorio/)
export default defineConfig({ base: process.env.VITE_BASE || '/', plugins: [react()] });
