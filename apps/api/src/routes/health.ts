import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => {
    const lastRun = await prisma.scrapeRun.findFirst({
      orderBy: { startedAt: "desc" }
    });
    const [jobCount, contestCount] = await Promise.all([
      prisma.job.count(),
      prisma.contest.count()
    ]);

    return {
      ok: !lastRun || lastRun.status !== "error",
      jobCount,
      contestCount,
      lastRun
    };
  });
}
