import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const host = "127.0.0.1";
const cliPort = process.argv.find((arg) => arg.startsWith("--port="));
const requestedPort = Number(process.env.PORT || cliPort?.split("=")[1] || 8000);
const root = process.cwd();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function resolvePath(urlPath) {
  const safePath = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const requested = safePath === "/" ? "/index.html" : safePath;
  return join(root, requested);
}

function handleRequest(req, res) {
  const filePath = resolvePath(req.url || "/");

  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const stats = statSync(filePath);
  if (stats.isDirectory()) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Directory listing disabled");
    return;
  }

  const ext = extname(filePath);
  res.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes[ext] || "application/octet-stream"
  });

  createReadStream(filePath).pipe(res);
}

function listen(port) {
  const server = createServer(handleRequest);

  server
    .once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        const nextPort = port + 1;
        console.log(`Port ${port} is busy, trying ${nextPort}...`);
        listen(nextPort);
        return;
      }

      throw error;
    })
    .listen(port, host, () => {
      console.log(`SnapCampus dev server running at http://${host}:${port}`);
    });
}

listen(requestedPort);
