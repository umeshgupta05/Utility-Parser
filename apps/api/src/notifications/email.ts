import { Resend } from "resend";
import { config } from "../config.js";
import { prisma } from "../db/client.js";

type SourcePayload = {
  title: string;
  body: string;
  url: string;
  sourceId: string;
};

let resend: Resend | null = null;

function getResend() {
  if (!config.resendApiKey) return null;
  resend ??= new Resend(config.resendApiKey);
  return resend;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendEmail(to: string, subject: string, text: string, url?: string) {
  const client = getResend();
  if (!client) {
    console.warn(`Email skipped for ${to}: RESEND_API_KEY is not configured.`);
    return;
  }

  const link = url
    ? `<p><a href="${escapeHtml(url)}" style="color:#2f5d50;font-weight:700;">Open opportunity</a></p>`
    : "";

  await client.emails.send({
    from: config.resendFromEmail,
    to,
    subject,
    text: url ? `${text}\n\n${url}` : text,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1c2b3a;">
        <h2 style="font-family:Georgia,serif;margin:0 0 12px;">${escapeHtml(subject)}</h2>
        <p>${escapeHtml(text)}</p>
        ${link}
      </div>
    `
  });
}

export async function notifySource(sourceId: string, payload: SourcePayload) {
  const users = await prisma.user.findMany({
    where: {
      preferences: {
        some: {
          sourceId,
          emailEnabled: true
        }
      }
    }
  });

  for (const user of users) {
    try {
      await sendEmail(user.email, payload.title, payload.body, payload.url);
    } catch (error) {
      console.error(`Email source alert failed for ${user.email}:`, error instanceof Error ? error.message : error);
    }
  }
}

export async function sendDueContestReminders() {
  const reminders = await prisma.contestReminder.findMany({
    where: {
      notifiedAt: null,
      notifyAt: { lte: new Date() }
    },
    include: {
      contest: true,
      user: true
    },
    take: 50
  });

  for (const reminder of reminders) {
    const starts = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata"
    }).format(reminder.contest.startTime);

    try {
      await sendEmail(
        reminder.user.email,
        "Contest starting soon",
        `${reminder.contest.name} starts at ${starts}.`,
        reminder.contest.url
      );
      await prisma.contestReminder.update({
        where: { id: reminder.id },
        data: { notifiedAt: new Date() }
      });
    } catch (error) {
      console.error(`Contest reminder failed for ${reminder.user.email}:`, error instanceof Error ? error.message : error);
    }
  }
}
