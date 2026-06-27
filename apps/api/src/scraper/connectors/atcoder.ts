import type { Connector, NormalizedItem } from "./types.js";

function htmlDecode(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function parseDurationToSeconds(value: string) {
  const parts = value.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export const atCoderConnector: Connector = {
  sourceId: "atcoder",
  label: "AtCoder",
  kind: "CONTEST",
  async fetchItems(): Promise<NormalizedItem[]> {
    const response = await fetch("https://atcoder.jp/contests/?lang=en", {
      headers: {
        Accept: "text/html",
        "User-Agent": "UtilityParser-UnstopJobAgent/0.1 (+contest listing)"
      },
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) throw new Error(`AtCoder returned ${response.status} ${response.statusText}`);

    const html = await response.text();
    const rows = [
      ...html.matchAll(
        /<tr>\s*<td class="text-center">[\s\S]*?<time class='fixtime fixtime-full'>([^<]+)<\/time>[\s\S]*?<td[^>]*>[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>[\s\S]*?<td class="text-center">([^<]+)<\/td>/g
      )
    ];

    const items: NormalizedItem[] = [];
    for (const match of rows) {
      const startText = match[1]?.trim();
      const href = match[2]?.trim();
      const title = htmlDecode(match[3]?.trim() ?? "");
      const duration = match[4]?.trim() ?? "";
      if (!startText || !href || !title) continue;

      const startTime = new Date(startText.replace(" ", "T"));
      if (Number.isNaN(startTime.getTime())) continue;

      items.push({
        id: `atcoder:${href.split("/").filter(Boolean).pop() ?? href}`,
        title,
        site: "atcoder",
        url: href.startsWith("http") ? href : `https://atcoder.jp${href}`,
        startTime,
        durationSec: parseDurationToSeconds(duration),
        raw: { site: "atcoder", href, startText, duration }
      });
    }

    return items.filter((item) => item.startTime && item.startTime.getTime() + (item.durationSec ?? 0) * 1000 >= Date.now());
  }
};
