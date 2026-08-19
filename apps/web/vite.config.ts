import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const contentSecurityPolicy: Plugin = {
  name: "content-security-policy",
  apply: "build",
  transformIndexHtml(html) {
    return html.replace(
      "</title>",
      `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP_DIRECTIVES}" />`,
    );
  },
};

export default defineConfig({
  envDir: "../../",
  plugins: [react(), contentSecurityPolicy],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
