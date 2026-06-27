import type { FastifyInstance } from "fastify";
import type { FastifyRequest } from "fastify";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db/client.js";
import { sendEmail } from "../notifications/email.js";

const loginSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase())
});

const verifySchema = z.object({
  token: z.string().min(32)
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCurrentUser(request: FastifyRequest) {
  const userId = request.cookies.userId;
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function requireCurrentUser(request: FastifyRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    throw Object.assign(new Error("Login required"), { statusCode: 401 });
  }
  return user;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const recentToken = await prisma.magicLoginToken.findFirst({
      where: {
        email: body.email,
        createdAt: { gte: new Date(Date.now() - 60_000) }
      },
      orderBy: { createdAt: "desc" }
    });

    if (recentToken) {
      return reply.code(429).send({ error: "Magic link already sent. Check your email or wait a minute." });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
    const token = randomBytes(32).toString("base64url");
    const verifyUrl = `${config.appPublicUrl}/auth/verify?token=${encodeURIComponent(token)}`;

    await prisma.magicLoginToken.create({
      data: {
        id: randomUUID(),
        tokenHash: hashToken(token),
        email: body.email,
        userId: existingUser?.id ?? null,
        expiresAt: new Date(Date.now() + 15 * 60_000)
      }
    });

    if (!config.resendApiKey) {
      request.log.warn(`Magic login link for ${body.email}: ${verifyUrl}`);
    }

    await sendEmail(
      body.email,
      "Your Opportunity Departures login link",
      "Click this link to sign in. It expires in 15 minutes and can be used only once.",
      verifyUrl
    );

    return {
      ok: true,
      devLink: config.resendApiKey ? undefined : verifyUrl
    };
  });

  app.post("/api/auth/verify", async (request, reply) => {
    const body = verifySchema.parse(request.body);
    const tokenHash = hashToken(body.token);
    const magicToken = await prisma.magicLoginToken.findUnique({ where: { tokenHash } });

    if (!magicToken || magicToken.usedAt || magicToken.expiresAt.getTime() < Date.now()) {
      return reply.code(400).send({ error: "Login link is invalid or expired." });
    }

    const user = await prisma.user.upsert({
      where: { email: magicToken.email },
      update: { lastLoginAt: new Date() },
      create: {
        id: randomUUID(),
        email: magicToken.email
      }
    });

    await prisma.magicLoginToken.update({
      where: { id: magicToken.id },
      data: {
        usedAt: new Date(),
        userId: user.id
      }
    });

    reply.setCookie("userId", user.id, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false
    });

    return { user };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const user = await getCurrentUser(request);

    if (!user) {
      return reply.code(401).send({ error: "Login required" });
    }

    return { user };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie("userId", { path: "/" });
    return { ok: true };
  });
}
