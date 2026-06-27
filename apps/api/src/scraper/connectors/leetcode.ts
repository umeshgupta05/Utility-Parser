import { LeetCode } from "leetcode-query";
import type { Connector, NormalizedItem } from "./types.js";
import { asNumber, asRecord, asString } from "./helpers.js";

const query = `
  query contestList {
    allContests {
      title
      titleSlug
      startTime
      duration
    }
  }
`;

export const leetcodeConnector: Connector = {
  sourceId: "leetcode",
  label: "LeetCode",
  kind: "CONTEST",
  async fetchItems(): Promise<NormalizedItem[]> {
    const client = new LeetCode();
    const payload = asRecord(await client.graphql({ query }));
    const data = asRecord(payload.data);
    const rows = Array.isArray(data.allContests) ? data.allContests : [];
    const now = Date.now();

    return rows
      .map((row) => {
        const record = asRecord(row);
        const start = (asNumber(record.startTime) ?? 0) * 1000;
        const durationSec = asNumber(record.duration) ?? 0;
        return { record, start, durationSec };
      })
      .filter(({ start, durationSec }) => start + durationSec * 1000 >= now)
      .map(({ record, start, durationSec }) => {
        const slug = asString(record.titleSlug) ?? asString(record.title) ?? "contest";
        return {
          id: `leetcode:${slug}`,
          title: asString(record.title) ?? "LeetCode Contest",
          site: "leetcode",
          url: `https://leetcode.com/contest/${slug}`,
          startTime: new Date(start),
          durationSec,
          raw: record
        };
      });
  }
};
