import { config } from "../../config.js";
import type { Connector, NormalizedItem } from "./types.js";
import { asNumber, asRecord, asString, fetchJsonWithTimeout, parseDate } from "./helpers.js";

const SOURCE_ID = "unstop_featured";

function findRows(payload: unknown) {
  const root = asRecord(payload);
  return Array.isArray(root.data) ? root.data : [];
}

function hasHomepageFeaturedGroup(row: Record<string, unknown>) {
  const group = asString(row.featured_group);
  return !group || group.split(",").map((item) => item.trim()).includes("homepage");
}

function buildUrl(row: Record<string, unknown>) {
  const directUrl = asString(row.url) ?? asString(row.web_url) ?? asString(row.website_url);
  if (directUrl) {
    if (directUrl.startsWith("http")) return directUrl;
    return `https://${directUrl.replace(/^\/+/, "")}`;
  }

  const publicUrl = asString(row.public_url);
  if (!publicUrl) return null;
  return publicUrl.startsWith("http") ? publicUrl : `https://unstop.com/${publicUrl.replace(/^\/+/, "")}`;
}

function durationSeconds(start: Date, end: Date | null) {
  if (!end || end.getTime() <= start.getTime()) return 0;
  return Math.round((end.getTime() - start.getTime()) / 1000);
}

function normalizeFeatured(rowValue: unknown): NormalizedItem | null {
  const row = asRecord(rowValue);
  const featuredId = asString(row.featured_id) ?? (row.featured_id == null ? null : String(row.featured_id));
  const id = asString(row.id) ?? (row.id == null ? null : String(row.id));
  const title = asString(row.featured_title) ?? asString(row.title) ?? asString(row.name) ?? asString(row.tag);
  const url = buildUrl(row);
  const hasFullBanner = Boolean(asRecord(row.fullbannerimages).image_url);

  if (!id || !title || !url || !hasFullBanner || !hasHomepageFeaturedGroup(row)) return null;

  const startTime =
    parseDate(row.start_date) ??
    parseDate(asRecord(row.regnRequirements).start_regn_dt) ??
    parseDate(row.created_at) ??
    new Date();
  const endTime = parseDate(row.end_date) ?? parseDate(asRecord(row.regnRequirements).end_regn_dt);
  const organisation = asRecord(row.organisation);
  const type = asString(row.type) ?? "featured";
  const registerCount = asNumber(row.registerCount ?? row.total_registrations);
  const viewsCount = asNumber(row.viewsCount ?? row.totalViews);

  return {
    id: `${SOURCE_ID}:${featuredId ?? id}`,
    title,
    site: SOURCE_ID,
    url,
    startTime,
    durationSec: durationSeconds(startTime, endTime),
    raw: {
      ...row,
      normalized_source: SOURCE_ID,
      normalized_organisation: asString(organisation.name),
      normalized_type: type,
      normalized_register_count: registerCount,
      normalized_views_count: viewsCount
    }
  };
}

export const unstopFeaturedConnector: Connector = {
  sourceId: SOURCE_ID,
  label: "Unstop Featured",
  kind: "CONTEST",
  async fetchItems(): Promise<NormalizedItem[]> {
    const payload = await fetchJsonWithTimeout(
      config.unstopFeaturedUrl,
      {
        headers: {
          Accept: "application/json,text/plain,*/*",
          Referer: "https://unstop.com/",
          "User-Agent": config.unstopUserAgent
        }
      },
      12_000
    );

    return findRows(payload)
      .map((row) => normalizeFeatured(row))
      .filter((item): item is NormalizedItem => Boolean(item));
  }
};
