import { prisma } from "./client.js";

const sources = [
  ["unstop", "Unstop", "JOB"],
  ["mycareernet", "MyCareerNet", "JOB"],
  ["hackerearth_jobs", "HackerEarth Jobs", "JOB"],
  ["unstop_featured", "Unstop Featured", "CONTEST"],
  ["codeforces", "Codeforces", "CONTEST"],
  ["leetcode", "LeetCode", "CONTEST"],
  ["codechef", "CodeChef", "CONTEST"],
  ["atcoder", "AtCoder", "CONTEST"]
] as const;

try {
  await prisma.job.updateMany({
    where: { sourceId: "sourceId" },
    data: { sourceId: "unstop" }
  });

  for (const [id, label, type] of sources) {
    await prisma.source.upsert({
      where: { id },
      update: { label, type, enabled: true },
      create: { id, label, type, enabled: true }
    });
  }

  await prisma.source.deleteMany({ where: { id: "kontests_other" } });

  console.log("Database seed is ready.");
} finally {
  await prisma.$disconnect();
}
