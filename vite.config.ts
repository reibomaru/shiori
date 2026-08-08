import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // フロント(5173) から /api・/auth を API サーバーへ転送（既定 8080。VITE_API_TARGET で上書き可）。
      // /auth はブラウザのトップレベル遷移（Google OAuth リダイレクト）も含めて中継する。
      "/api": process.env.VITE_API_TARGET || "http://localhost:8080",
      "/auth": process.env.VITE_API_TARGET || "http://localhost:8080",
    },
  },
});
