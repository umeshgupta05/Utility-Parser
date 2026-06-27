import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { prisma } from "./db/client.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerContestRoutes } from "./routes/contests.js";
import { registerScrapeRoutes } from "./routes/scrape.js";
import { registerSourceRoutes } from "./routes/sources.js";
import { registerUserRoutes } from "./routes/user.js";
import { startScheduler } from "./scheduler.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: config.corsOrigin,
  credentials: true
});
await app.register(cookie, {
  secret: config.cookieSecret
});
await app.register(registerAuthRoutes);
await app.register(registerHealthRoutes);
await app.register(registerJobRoutes);
await app.register(registerContestRoutes);
await app.register(registerSourceRoutes);
await app.register(registerUserRoutes);
await app.register(registerScrapeRoutes);

if (config.webDistPath && existsSync(config.webDistPath)) {
  await app.register(fastifyStatic, {
    root: path.resolve(config.webDistPath),
    prefix: "/"
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  startScheduler();
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
