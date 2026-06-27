import "dotenv/config";

const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production";
const placeholderCookieSecret = "local-dev-cookie-secret-change-me";
const cookieSecret = process.env.COOKIE_SECRET ?? (isProduction ? "" : placeholderCookieSecret);

if (isProduction && !cookieSecret) {
  throw new Error("COOKIE_SECRET is required in production. Set it through your deployment environment or .env file.");
}

if (isProduction && cookieSecret === placeholderCookieSecret) {
  throw new Error("COOKIE_SECRET must be changed from the local development placeholder in production.");
}

export const TARGET_PAGE_URL =
  "https://unstop.com/job/in-office-software-development-jobs-for-freshers?job_type=in_office&job_timing=full_time&roles=software-development&usertype=fresher&oppstatus=open";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: corsOrigin === "true" ? true : corsOrigin,
  appPublicUrl: process.env.APP_PUBLIC_URL ?? "http://localhost:5173",
  webDistPath: process.env.WEB_DIST_PATH ?? "",
  cookieSecret,
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "Opportunity Departures <onboarding@resend.dev>",
  unstopUserAgent:
    process.env.UNSTOP_USER_AGENT ??
    "UtilityParser-UnstopJobAgent/0.1 (+personal job search; local)",
  unstopSearchUrl:
    process.env.UNSTOP_SEARCH_URL ??
    "https://unstop.com/api/public/opportunity/search-result?opportunity=jobs&job_type=in_office&job_timing=full_time&roles=software-development&usertype=fresher&oppstatus=open&page=1",
  unstopFeaturedUrl:
    process.env.UNSTOP_FEATURED_URL ??
    "https://unstop.com/api/public/get-all-featured?page=homepage&custom=true",
  myCareerNetJobsUrl: process.env.MYCAREERNET_JOBS_URL || "",
  myCareerNetTenantAlias: process.env.MYCAREERNET_TENANT_ALIAS || "mycareernet",
  myCareerNetTenantConfigUrl:
    process.env.MYCAREERNET_TENANT_CONFIG_URL ||
    "https://mycareernet.co/py/common/get_oauth_and_captcha_config/",
  myCareerNetContestsUrl:
    process.env.MYCAREERNET_CONTESTS_URL ||
    "https://mycareernet.co/py/crpo/hackathon/candidate/api/v1/getAll/",
  myCareerNetBaseUrl: process.env.MYCAREERNET_BASE_URL || "https://mycareernet.co",
  hackerEarthJobsUrl:
    process.env.HACKEREARTH_JOBS_URL ||
    "https://www.hackerearth.com/api/community/job/opportunities/?page=1&size=25",
  hackerEarthChallengesUrl:
    process.env.HACKEREARTH_CHALLENGES_URL ||
    "https://www.hackerearth.com/api/community/challenges/compete/"
};
