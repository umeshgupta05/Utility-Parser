import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "Opportunity Departures <onboarding@resend.dev>";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendEmail(to: string, subject: string, text: string, url?: string) {
  if (!resendApiKey) {
    console.warn(`Email skipped for ${to}: RESEND_API_KEY is not configured.`);
    return;
  }

  const link = url
    ? `<p><a href="${escapeHtml(url)}" style="color:#2f5d50;font-weight:700;">Open opportunity</a></p>`
    : "";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
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
    })
  });

  if (!response.ok) throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
}

Deno.serve(async () => {
  const { data: reminders, error } = await supabase
    .from("contest_reminder")
    .select("id,user_id,contest:contest_id(name,url,start_time)")
    .is("notified_at", null)
    .lte("notify_at", new Date().toISOString())
    .limit(50);

  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  for (const reminder of reminders ?? []) {
    const contest = Array.isArray(reminder.contest) ? reminder.contest[0] : reminder.contest;
    if (!contest) continue;
    const user = await supabase.auth.admin.getUserById(reminder.user_id);
    const email = user.data.user?.email;
    if (!email) continue;

    const starts = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata"
    }).format(new Date(contest.start_time));

    await sendEmail(email, "Contest starting soon", `${contest.name} starts at ${starts}.`, contest.url);
    await supabase.from("contest_reminder").update({ notified_at: new Date().toISOString() }).eq("id", reminder.id);
    sent += 1;
  }

  return json({ sent });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
