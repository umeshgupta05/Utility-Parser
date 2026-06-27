import type { Connector, NormalizedItem } from "./types.js";
import { asNumber, asRecord, asString, fetchJsonWithTimeout, parseDate } from "./helpers.js";

export const codeChefConnector: Connector = {
  sourceId: "codechef",
  label: "CodeChef",
  kind: "CONTEST",
  async fetchItems(): Promise<NormalizedItem[]> {
    const payload = asRecord(
      await fetchJsonWithTimeout(
        "https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all",
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "UtilityParser-UnstopJobAgent/0.1 (+contest listing)"
          }
        },
        12_000
      )
    );

    const rows = [
      ...(Array.isArray(payload.present_contests) ? payload.present_contests : []),
      ...(Array.isArray(payload.future_contests) ? payload.future_contests : [])
    ];

    const items: NormalizedItem[] = [];
    for (const row of rows) {
      const record = asRecord(row);
      const code = asString(record.contest_code);
      const title = asString(record.contest_name);
      const startTime = parseDate(record.contest_start_date_iso);
      if (!code || !title || !startTime) continue;

      items.push({
        id: `codechef:${code}`,
        title,
        site: "codechef",
        url: `https://www.codechef.com/${code}`,
        startTime,
        durationSec: Math.round((asNumber(record.contest_duration) ?? 0) * 60),
        raw: { site: "codechef", ...record }
      });
    }

    return items;
  }
};
