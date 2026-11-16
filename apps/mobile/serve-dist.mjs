// Minimal static server for the exported Expo web build, with SPA fallback to
// index.html so client-side (expo-router) deep links resolve. Dev/preview only.
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const ROOT = "/Users/sarizie/Desktop/SYLVESTER/Photography_Biz/apps/mobile/dist";
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let filePath = join(ROOT, normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));

  // Directory or unknown path -> serve index.html (SPA fallback).
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(ROOT, "index.html");
  }

  res.writeHead(200, {
    "Content-Type": TYPES[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Serving Expo web build on http://127.0.0.1:${PORT}`);
});
