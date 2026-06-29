import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // フロント(5173) から /api を API サーバーへ転送（既定 8080。VITE_API_TARGET で上書き可）
      "/api": process.env.VITE_API_TARGET || "http://localhost:8080",
    },
  },
});
