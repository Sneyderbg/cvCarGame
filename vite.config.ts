import { defineConfig } from "vite"

export default defineConfig({
  base: "/cvCarGame/",
  build: {
    chunkSizeWarningLimit: 16000,
  },
})
