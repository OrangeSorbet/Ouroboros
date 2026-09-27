import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import path from 'path'

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      react: path.resolve(import.meta.dirname, './node_modules/preact/compat'),
      'react-dom': path.resolve(import.meta.dirname, './node_modules/preact/compat'),
      'react/jsx-runtime': path.resolve(import.meta.dirname, './node_modules/preact/jsx-runtime'),
    },
  },
})