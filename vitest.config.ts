import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      FRONTEND_URL: "https://loft-frontend.onrender.com",
    },
    server: {
      deps: {
        inline: ["@emailjs/nodejs"],
      },
    },
  },
})
