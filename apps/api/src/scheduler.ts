import cron from "node-cron";
import { runScraper } from "./scraper/unstop.js";
import { atCoderConnector } from "./scraper/connectors/atcoder.js";
import { codeChefConnector } from "./scraper/connectors/codechef.js";
import { codeforcesConnector } from "./scraper/connectors/codeforces.js";
import { hackerEarthJobsConnector, myCareerNetConnector } from "./scraper/connectors/genericJobs.js";
import { leetcodeConnector } from "./scraper/connectors/leetcode.js";
import { unstopFeaturedConnector } from "./scraper/connectors/unstopFeatured.js";
import { runConnector } from "./scraper/runConnector.js";
import type { Connector } from "./scraper/connectors/types.js";
import { sendDueContestReminders } from "./notifications/email.js";

const jitterMs = () => (120_000 + Math.floor(Math.random() * 60_000));

function scheduleScrape(label: string) {
  const delay = jitterMs();
  console.log(`${label} scrape scheduled in ${Math.round(delay / 1000)}s`);

  setTimeout(() => {
    runScraper().catch((error) => {
      const message = error instanceof Error ? error.message : "Unknown scraper error";
      console.error(`${label} scrape failed:`, message);
    });
  }, delay);
}

function scheduleConnector(label: string, connector: Connector) {
  const delay = jitterMs();
  console.log(`${label} scheduled in ${Math.round(delay / 1000)}s`);

  setTimeout(() => {
    runConnector(connector).catch((error) => {
      const message = error instanceof Error ? error.message : "Unknown connector error";
      console.error(`${label} failed:`, message);
    });
  }, delay);
}

export function startScheduler() {
  setInterval(() => {
    sendDueContestReminders().catch((error) => {
      const message = error instanceof Error ? error.message : "Unknown reminder error";
      console.error("contest reminder worker failed:", message);
    });
  }, 60_000);

  cron.schedule("*/30 8-23 * * *", () => scheduleScrape("daytime"), {
    timezone: "Asia/Kolkata"
  });

  cron.schedule("0 0-7 * * *", () => scheduleScrape("overnight"), {
    timezone: "Asia/Kolkata"
  });

  cron.schedule("7,37 8-23 * * *", () => scheduleConnector("mycareernet jobs", myCareerNetConnector), {
    timezone: "Asia/Kolkata"
  });
  cron.schedule("7 0-7 * * *", () => scheduleConnector("mycareernet jobs", myCareerNetConnector), {
    timezone: "Asia/Kolkata"
  });

  cron.schedule("12,42 8-23 * * *", () => scheduleConnector("hackerearth jobs", hackerEarthJobsConnector), {
    timezone: "Asia/Kolkata"
  });
  cron.schedule("12 0-7 * * *", () => scheduleConnector("hackerearth jobs", hackerEarthJobsConnector), {
    timezone: "Asia/Kolkata"
  });

  cron.schedule("17,47 * * * *", () => scheduleConnector("codeforces contests", codeforcesConnector), {
    timezone: "Asia/Kolkata"
  });

  cron.schedule("22 * * * *", () => scheduleConnector("leetcode contests", leetcodeConnector), {
    timezone: "Asia/Kolkata"
  });

  cron.schedule("27 * * * *", () => scheduleConnector("codechef contests", codeChefConnector), {
    timezone: "Asia/Kolkata"
  });

  cron.schedule("32 * * * *", () => scheduleConnector("atcoder contests", atCoderConnector), {
    timezone: "Asia/Kolkata"
  });

  cron.schedule("2,32 8-23 * * *", () => scheduleConnector("unstop featured", unstopFeaturedConnector), {
    timezone: "Asia/Kolkata"
  });
  cron.schedule("2 0-7 * * *", () => scheduleConnector("unstop featured", unstopFeaturedConnector), {
    timezone: "Asia/Kolkata"
  });

  console.log("Scraper scheduler started for Asia/Kolkata");
}
