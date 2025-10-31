import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    https: {
      pfx: fs.readFileSync(
        path.resolve(__dirname, "localhost-cert/localhost.pfx"),
      ),
      passphrase: "1234",
    },
    port: 5173,
    host: "localhost",
  },
});
