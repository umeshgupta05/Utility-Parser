import type { FastifyInstance } from "fastify";
import { runScraper } from "../scraper/unstop.js";
import { atCoderConnector } from "../scraper/connectors/atcoder.js";
import { codeChefConnector } from "../scraper/connectors/codechef.js";
import { codeforcesConnector } from "../scraper/connectors/codeforces.js";
import { hackerEarthJobsConnector, myCareerNetConnector } from "../scraper/connectors/genericJobs.js";
import { leetcodeConnector } from "../scraper/connectors/leetcode.js";
import { unstopFeaturedConnector } from "../scraper/connectors/unstopFeatured.js";
import { runConnector } from "../scraper/runConnector.js";

const connectors = {
  codeforces: codeforcesConnector,
  leetcode: leetcodeConnector,
  codechef: codeChefConnector,
  atcoder: atCoderConnector,
  mycareernet: myCareerNetConnector,
  hackerearth_jobs: hackerEarthJobsConnector,
  unstop_featured: unstopFeaturedConnector
};

export async function registerScrapeRoutes(app: FastifyInstance) {
  app.post("/api/scrape/run", async () => {
    const result = await runScraper();
    return result;
  });

  app.post("/api/scrape/run/:sourceId", async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };
    if (sourceId === "unstop") return runScraper();

    const connector = connectors[sourceId as keyof typeof connectors];
    if (!connector) {
      return reply.code(404).send({ error: "Unknown connector" });
    }

    return runConnector(connector);
  });
}
