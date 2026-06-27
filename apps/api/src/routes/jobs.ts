import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";

const sortValues = [
  "newest",
  "new_first",
  "posted_newest",
  "posted_oldest",
  "deadline",
  "deadline_latest",
  "company_az",
  "company_za",
  "title_az",
  "title_za"
] as const;

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().trim().optional(),
  sourceId: z.string().trim().optional(),
  sortBy: z.enum(sortValues).default("newest")
});

const markSeenSchema = z.object({
  ids: z.array(z.string()).min(1).max(200)
});

function serializeJob(
  job: {
  id: string;
  sourceId: string;
  title: string;
  company: string;
  location: string | null;
  jobType: string | null;
  timing: string | null;
  applyUrl: string;
  postedAt: Date | null;
  deadline: Date | null;
  firstSeenAt: Date;
  isNew: boolean;
  raw?: string;
  },
  options: { includeRaw?: boolean } = {}
) {
  const { raw, ...publicJob } = job;
  return {
    ...publicJob,
    raw: options.includeRaw && raw ? JSON.parse(raw) : undefined
  };
}

function getOrderBy(
  sortBy: (typeof sortValues)[number]
): Prisma.JobOrderByWithRelationInput[] {
  switch (sortBy) {
    case "new_first":
      return [{ isNew: "desc" }, { firstSeenAt: "desc" }];
    case "posted_newest":
      return [{ postedAt: "desc" }, { firstSeenAt: "desc" }];
    case "posted_oldest":
      return [{ postedAt: "asc" }, { firstSeenAt: "desc" }];
    case "deadline":
      return [{ deadline: "asc" }, { firstSeenAt: "desc" }];
    case "deadline_latest":
      return [{ deadline: "desc" }, { firstSeenAt: "desc" }];
    case "company_az":
      return [{ company: "asc" }, { title: "asc" }];
    case "company_za":
      return [{ company: "desc" }, { title: "asc" }];
    case "title_az":
      return [{ title: "asc" }, { company: "asc" }];
    case "title_za":
      return [{ title: "desc" }, { company: "asc" }];
    case "newest":
    default:
      return [{ firstSeenAt: "desc" }];
  }
}

export async function registerJobRoutes(app: FastifyInstance) {
  app.get("/api/jobs", async (request) => {
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.JobWhereInput = {
      ...(query.sourceId ? { sourceId: query.sourceId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search } },
              { company: { contains: query.search } }
            ]
          }
        : {})
    };

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: getOrderBy(query.sortBy),
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      prisma.job.count({ where })
    ]);

    return {
      data: jobs.map((job) => serializeJob(job)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit)
    };
  });

  app.get("/api/jobs/new", async () => {
    const [count, jobs] = await Promise.all([
      prisma.job.count({ where: { isNew: true } }),
      prisma.job.findMany({
        where: { isNew: true },
        orderBy: { firstSeenAt: "desc" },
        take: 10
      })
    ]);

    return { count, data: jobs.map((job) => serializeJob(job)) };
  });

  app.post("/api/jobs/mark-seen", async (request) => {
    const body = markSeenSchema.parse(request.body);
    const result = await prisma.job.updateMany({
      where: { id: { in: body.ids } },
      data: { isNew: false }
    });

    return { updated: result.count };
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const job = await prisma.job.findUnique({ where: { id: params.id } });

    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    return serializeJob(job, { includeRaw: true });
  });
}
