import { createServer, type Server } from "node:http";
import { createApp } from "../../src/app.js";

/**
 * One long-lived HTTP server per suite.
 *
 * Passing an Express app straight to supertest makes it bind *and close* a fresh
 * ephemeral server for every single request. Across a suite this churns through
 * hundreds of ports fast enough that the OS recycles one while a client still
 * has a socket for it, and the response gets read off the wrong connection —
 * which surfaces as impossible status codes (407, 501, ...) on unrelated tests.
 * Binding once removes the race entirely, and is faster.
 */
export async function startTestServer(): Promise<Server> {
  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

export function stopTestServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
