import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Gera os ícones da app (PC, Android e iPhone) a partir de public/icone.svg:
//   npm run icones
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: { sizes: [180], padding: 0.1, resizeOptions: { background: '#0b1220' } },
    maskable: { sizes: [512], padding: 0.15, resizeOptions: { background: '#0b1220' } },
  },
  images: ['public/icone.svg'],
})
