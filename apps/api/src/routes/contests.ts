import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";

const contestSortValues = ["start_asc", "start_desc", "newest", "site_az", "name_az"] as const;

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  site: z.string().trim().optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(contestSortValues).default("start_asc")
});

const markSeenSchema = z.object({
  ids: z.array(z.string()).min(1).max(200)
});

function getOrderBy(sortBy: (typeof contestSortValues)[number]): Prisma.ContestOrderByWithRelationInput[] {
  switch (sortBy) {
    case "start_desc":
      return [{ startTime: "desc" }];
    case "newest":
      return [{ firstSeenAt: "desc" }];
    case "site_az":
      return [{ site: "asc" }, { startTime: "asc" }];
    case "name_az":
      return [{ name: "asc" }];
    case "start_asc":
    default:
      return [{ startTime: "asc" }];
  }
}

function serializeContest(contest: {
  id: string;
  site: string;
  name: string;
  url: string;
  startTime: Date;
  durationSec: number;
  firstSeenAt: Date;
  isNew: boolean;
  raw?: string;
}) {
  const { raw, ...publicContest } = contest;
  return { ...publicContest, raw: raw ? JSON.parse(raw) : undefined };
}

export async function registerContestRoutes(app: FastifyInstance) {
  app.get("/api/contests", async (request) => {
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.ContestWhereInput = {
      ...(query.site ? { site: query.site } : {}),
      ...(query.search ? { name: { contains: query.search } } : {})
    };

    const [contests, total] = await Promise.all([
      prisma.contest.findMany({
        where,
        orderBy: getOrderBy(query.sortBy),
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      prisma.contest.count({ where })
    ]);

    return {
      data: contests.map(serializeContest),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit)
    };
  });

  app.get("/api/contests/new", async () => {
    const [count, contests] = await Promise.all([
      prisma.contest.count({ where: { isNew: true } }),
      prisma.contest.findMany({
        where: { isNew: true },
        orderBy: { firstSeenAt: "desc" },
        take: 10
      })
    ]);

    return { count, data: contests.map(serializeContest) };
  });

  app.post("/api/contests/mark-seen", async (request) => {
    const body = markSeenSchema.parse(request.body);
    const result = await prisma.contest.updateMany({
      where: { id: { in: body.ids } },
      data: { isNew: false }
    });

    return { updated: result.count };
  });
}
