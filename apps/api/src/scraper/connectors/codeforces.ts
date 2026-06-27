import type { Connector, NormalizedItem } from "./types.js";
import { asNumber, asRecord, asString, fetchJsonWithTimeout } from "./helpers.js";

export const codeforcesConnector: Connector = {
  sourceId: "codeforces",
  label: "Codeforces",
  kind: "CONTEST",
  async fetchItems(): Promise<NormalizedItem[]> {
    const payload = asRecord(
      await fetchJsonWithTimeout("https://codeforces.com/api/contest.list", {
        headers: { Accept: "application/json" }
      })
    );
    const rows = Array.isArray(payload.result) ? payload.result : [];

    return rows
      .filter((row) => {
        const record = asRecord(row);
        return record.phase === "BEFORE" || record.phase === "CODING";
      })
      .map((row) => {
        const record = asRecord(row);
        const id = String(record.id);
        const startSeconds = asNumber(record.startTimeSeconds) ?? Math.floor(Date.now() / 1000);
        const durationSec = asNumber(record.durationSeconds) ?? 0;
        return {
          id: `codeforces:${id}`,
          title: asString(record.name) ?? "Codeforces Contest",
          site: "codeforces",
          url: `https://codeforces.com/contest/${id}`,
          startTime: new Date(startSeconds * 1000),
          durationSec,
          raw: row
        };
      });
  }
};
