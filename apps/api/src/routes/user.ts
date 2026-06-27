import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireCurrentUser } from "./auth.js";

const preferenceSchema = z.object({
  sourceId: z.string().min(1),
  visible: z.boolean().optional(),
  emailEnabled: z.boolean().optional()
});

const reminderSchema = z.object({
  contestId: z.string().min(1),
  enabled: z.boolean()
});

function serializePreference(preference: {
  sourceId: string;
  visible: boolean;
  emailEnabled: boolean;
}) {
  return {
    sourceId: preference.sourceId,
    visible: preference.visible,
    emailEnabled: preference.emailEnabled
  };
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/api/users/me/state", async (request) => {
    const user = await requireCurrentUser(request);
    const [preferences, reminders] = await Promise.all([
      prisma.userSourcePreference.findMany({ where: { userId: user.id } }),
      prisma.contestReminder.findMany({
        where: { userId: user.id, notifiedAt: null },
        select: { contestId: true }
      })
    ]);

    return {
      user,
      preferences: preferences.map(serializePreference),
      reminders: reminders.map((reminder) => reminder.contestId)
    };
  });

  app.put("/api/users/me/preferences", async (request) => {
    const user = await requireCurrentUser(request);
    const body = preferenceSchema.parse(request.body);
    const existing = await prisma.userSourcePreference.findUnique({
      where: {
        userId_sourceId: {
          userId: user.id,
          sourceId: body.sourceId
        }
      }
    });

    const preference = await prisma.userSourcePreference.upsert({
      where: {
        userId_sourceId: {
          userId: user.id,
          sourceId: body.sourceId
        }
      },
      update: {
        visible: body.visible ?? existing?.visible ?? true,
        emailEnabled: body.emailEnabled ?? existing?.emailEnabled ?? false
      },
      create: {
        id: randomUUID(),
        userId: user.id,
        sourceId: body.sourceId,
        visible: body.visible ?? true,
        emailEnabled: body.emailEnabled ?? false
      }
    });

    return { preference: serializePreference(preference) };
  });

  app.post("/api/users/me/reminders", async (request) => {
    const user = await requireCurrentUser(request);
    const body = reminderSchema.parse(request.body);

    if (!body.enabled) {
      await prisma.contestReminder.deleteMany({
        where: {
          userId: user.id,
          contestId: body.contestId
        }
      });
      return { enabled: false, contestId: body.contestId };
    }

    const contest = await prisma.contest.findUnique({ where: { id: body.contestId } });
    if (!contest) {
      throw Object.assign(new Error("Contest not found"), { statusCode: 404 });
    }

    const notifyAt = new Date(Math.max(Date.now(), contest.startTime.getTime() - 10 * 60 * 1000));
    const reminder = await prisma.contestReminder.upsert({
      where: {
        userId_contestId: {
          userId: user.id,
          contestId: contest.id
        }
      },
      update: {
        notifyAt,
        notifiedAt: null
      },
      create: {
        id: randomUUID(),
        userId: user.id,
        contestId: contest.id,
        notifyAt
      }
    });

    return { enabled: true, contestId: reminder.contestId, notifyAt: reminder.notifyAt };
  });
}
