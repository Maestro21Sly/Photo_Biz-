import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { createIo } from "./realtime.js";
import { prisma } from "./db.js";

const app = createApp();
const httpServer = createServer(app);
const io = createIo(httpServer);

httpServer.listen(env.port, () => {
  console.log(`SnapCampus API listening on http://localhost:${env.port}`);
});

const shutdown = async () => {
  io.close();
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
