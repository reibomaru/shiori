import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // フロント(5173) から /api を API サーバー(8080) へ転送
      "/api": "http://localhost:8080",
    },
  },
});
