import { prisma } from "./db/client.js";
import { runScraper } from "./scraper/unstop.js";

try {
  const result = await runScraper();
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
