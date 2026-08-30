import { defineConfig } from "vite";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

export default defineConfig({
  root: resolve(__dirname, "site"),
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "dist/site"),
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "site/index.html"),
        demo: resolve(__dirname, "site/demo/index.html"),
        privacy: resolve(__dirname, "site/privacy/index.html"),
        terms: resolve(__dirname, "site/terms/index.html"),
        notFound: resolve(__dirname, "site/404.html")
      }
    }
  },
  plugins: [{
    name: "versioned-service-worker",
    generateBundle(_options, bundle) {
      const buildId = createHash("sha256").update(Object.keys(bundle).sort().join("\n")).digest("hex").slice(0, 12);
      const shell = ["/", "/demo/", "/privacy/", "/terms/", "/app-mark.svg", "/assets/mailroom-hero-760.webp"];
      const source = `const CACHE="reminder-mailroom-site-${buildId}";const SHELL=${JSON.stringify(shell)};self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("reminder-mailroom-site-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener("fetch",e=>{if(e.request.method!=="GET"||new URL(e.request.url).origin!==location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match("/"))))});`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    }
  }],
  server: { port: 4173, strictPort: true }
});
