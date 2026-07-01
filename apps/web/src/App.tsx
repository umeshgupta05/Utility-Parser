import {
  ArrowUpRight,
  Bell,
  BellOff,
  ChevronDown,
  Columns,
  Milestone,
  Moon,
  RefreshCw,
  Search,
  Share2,
  SlidersHorizontal,
  Sun
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { supabase } from "./supabaseClient";

type Job = {
  id: string;
  sourceId: string;
  title: string;
  company: string;
  location: string | null;
  jobType: string | null;
  timing: string | null;
  applyUrl: string;
  postedAt: string | null;
  deadline: string | null;
  firstSeenAt: string;
  isNew: boolean;
};

type Contest = {
  id: string;
  site: string;
  name: string;
  url: string;
  startTime: string;
  durationSec: number;
  firstSeenAt: string;
  isNew: boolean;
};

type Source = {
  id: string;
  label: string;
  type: "JOB" | "CONTEST" | string;
  enabled: boolean;
  newCount: number;
  lastRun?: ScrapeRun | null;
};

type VisibleNewCount = {
  count: number;
  expiresAt: number;
  runKey: string;
};

type ScrapeRun = {
    status: string;
    startedAt: string;
    endedAt: string | null;
    jobsFound: number;
    jobsInserted: number;
    errorMessage: string | null;
};

type JobsResponse = {
  data: Job[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ContestsResponse = {
  data: Contest[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type Health = {
  ok: boolean;
  jobCount: number;
  lastRun: ScrapeRun | null;
};

type User = {
  id: string;
  email: string;
  createdAt: string;
  lastLoginAt: string;
};

type UserPreference = {
  sourceId: string;
  visible: boolean;
  emailEnabled: boolean;
};

type UserState = {
  user: User;
  preferences: UserPreference[];
  reminders: string[];
};

type SortBy =
  | "newest"
  | "new_first"
  | "posted_newest"
  | "posted_oldest"
  | "deadline"
  | "deadline_latest"
  | "company_az"
  | "company_za"
  | "title_az"
  | "title_za";

type ViewMode = "jobs" | "contests" | "all";
type GridColumns = "auto" | "1" | "2" | "3";
type CardSize = "compact" | "standard" | "large";
type DisplayStyle = "ticket" | "board" | "list";

type DisplaySettings = {
  columns: GridColumns;
  size: CardSize;
  style: DisplayStyle;
};

const NEW_COUNT_VISIBLE_MS = 5 * 60 * 1000;
const CINEMATIC_SCRUB_END_PROGRESS = 0.86;

type TicketItem =
  | {
      kind: "job";
      id: string;
      sourceId: string;
      title: string;
      subtitle: string;
      url: string;
      isNew: boolean;
      firstSeenAt: string;
      data: Array<{ label: string; value: string; alert?: boolean }>;
      route: string;
      action: string;
      startsAt?: string;
    }
  | {
      kind: "contest";
      id: string;
      sourceId: string;
      title: string;
      subtitle: string;
      url: string;
      isNew: boolean;
      firstSeenAt: string;
      data: Array<{ label: string; value: string; alert?: boolean }>;
      route: string;
      action: string;
      startsAt: string;
    };

function formatRelative(value: string | null) {
  if (!value) return "Date unknown";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000]
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  for (const [unit, ms] of units) {
    if (abs >= ms) return formatter.format(Math.round(-diff / ms), unit);
  }

  return "just now";
}

function formatCountdown(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "running now";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.max(0, Math.round((diff % 3_600_000) / 60_000));
  if (hours >= 24) return `starts in ${Math.round(hours / 24)}d`;
  if (hours > 0) return `starts in ${hours}h ${minutes}m`;
  return `starts in ${minutes}m`;
}

function contestEndTime(contest: Contest) {
  return new Date(contest.startTime).getTime() + Math.max(0, contest.durationSec) * 1000;
}

function isContestEnded(contest: Contest) {
  return contestEndTime(contest) <= Date.now();
}

function contestStatus(contest: Contest) {
  const now = Date.now();
  const start = new Date(contest.startTime).getTime();
  if (contestEndTime(contest) <= now) return "Ended";
  if (start <= now) return "Running";
  return "Upcoming";
}

function formatDate(value: string | null) {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    hour: "2-digit",
    hour12: true,
    minute: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatDateStamp(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short"
  })
    .format(new Date(value))
    .toUpperCase();
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function prettyToken(value: string | null) {
  return value ? value.replaceAll("_", " ") : "Not specified";
}

function barcodeBars(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;

  return Array.from({ length: 18 }, (_, index) => {
    const width = ((hash >> (index % 12)) & 3) + 1;
    const height = 34 + ((hash >> (index % 8)) & 7) * 4;
    return { width, height };
  });
}

function isDeadlineSoon(value: string | null) {
  if (!value) return false;
  const diff = new Date(value).getTime() - Date.now();
  return diff > 0 && diff <= 3 * 24 * 60 * 60 * 1000;
}

function isJobExpired(job: Job) {
  return Boolean(job.deadline && new Date(job.deadline).getTime() <= Date.now());
}

function contestSourceId(site: string) {
  return site;
}

function formatSiteLabel(site: string) {
  const labels: Record<string, string> = {
    atcoder: "AtCoder",
    codechef: "CodeChef",
    codeforces: "Codeforces",
    hackerearth_challenges: "HackerEarth Challenges",
    leetcode: "LeetCode",
    unstop_featured: "Unstop Featured"
  };
  return labels[site] ?? site.replaceAll("_", " ").replaceAll("-", " ");
}

function displayRunStatus(status: string) {
  return status.split(":")[0].toUpperCase();
}

function mapRun(row: any): ScrapeRun | null {
  if (!row) return null;
  return {
    status: row.status,
    startedAt: row.started_at ?? row.startedAt,
    endedAt: row.ended_at ?? row.endedAt ?? null,
    jobsFound: row.jobs_found ?? row.jobsFound ?? 0,
    jobsInserted: row.jobs_inserted ?? row.jobsInserted ?? 0,
    errorMessage: row.error_message ?? row.errorMessage ?? null
  };
}

function mapJob(row: any): Job {
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    company: row.company,
    location: row.location,
    jobType: row.job_type,
    timing: row.timing,
    applyUrl: row.apply_url,
    postedAt: row.posted_at,
    deadline: row.deadline,
    firstSeenAt: row.first_seen_at,
    isNew: row.is_new
  };
}

function mapContest(row: any): Contest {
  return {
    id: row.id,
    site: row.site,
    name: row.name,
    url: row.url,
    startTime: row.start_time,
    durationSec: row.duration_sec,
    firstSeenAt: row.first_seen_at,
    isNew: row.is_new
  };
}

function mapSource(row: any): Source {
  return {
    id: row.id,
    label: row.label,
    type: row.type,
    enabled: row.enabled,
    newCount: row.new_count ?? 0,
    lastRun: mapRun(row.last_run)
  };
}

function formatSourceStatus(source: Source, visibleNewCount: number) {
  if (!source.lastRun) return `${source.label.toUpperCase()}: NO SCRAPER RUNS YET`;
  return `${displayRunStatus(source.lastRun.status)}: ${source.label.toUpperCase()} ${source.lastRun.jobsFound} FOUND, ${visibleNewCount} NEW`;
}

function formatAggregateStatus(sources: Source[], visibleNewCounts: Record<string, number>) {
  const runs = sources.map((source) => source.lastRun).filter((run): run is ScrapeRun => Boolean(run));
  if (runs.length === 0) return "NO SCRAPER RUNS YET";

  const found = runs.reduce((total, run) => total + run.jobsFound, 0);
  const inserted = sources.reduce((total, source) => total + (visibleNewCounts[source.id] ?? 0), 0);
  const errors = runs.filter((run) => displayRunStatus(run.status) === "ERROR").length;
  const prefix = errors > 0 ? `ERROR: ${errors} SOURCE${errors === 1 ? "" : "S"} FAILED` : "SUCCESS";

  return `${prefix}: ${runs.length} SOURCES SYNCED, ${found} FOUND, ${inserted} NEW`;
}

function TicketLookupInput({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="ticketLookup">
      <Search size={18} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="LOOK UP ROLE, COMPANY, OR PLATFORM"
      />
    </label>
  );
}

function EmailLogin({
  message,
  currentUser,
  loading,
  onLogin,
  onLogout
}: {
  message: string | null;
  currentUser: User | null;
  loading: boolean;
  onLogin: (email: string) => void;
  onLogout: () => void;
}) {
  const [email, setEmail] = useState("");

  if (currentUser) {
    return (
      <div className="userBadge">
        <span>{currentUser.email}</span>
        <button type="button" onClick={onLogout}>Logout</button>
      </div>
    );
  }

  return (
    <form
      className="loginForm"
      onSubmit={(event) => {
        event.preventDefault();
        onLogin(email);
      }}
    >
      <input
        aria-label="Email login"
        disabled={loading}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="EMAIL"
        type="email"
        value={email}
      />
      <button disabled={loading || email.trim().length === 0} type="submit">
        {loading ? "..." : "Send link"}
      </button>
      {message ? <small>{message}</small> : null}
    </form>
  );
}

function LoginScreen({
  authMessage,
  currentUser,
  loading,
  onBack,
  onLogin,
  onLogout
}: {
  authMessage: string | null;
  currentUser: User | null;
  loading: boolean;
  onBack: () => void;
  onLogin: (email: string) => void;
  onLogout: () => void;
}) {
  return (
    <main className="loginPage">
      <section className="loginPanel" aria-label="Login required">
        <div>
          <span className="loginRoute">SECURE NOTIFICATIONS</span>
          <h1>Login Required</h1>
          <p>Email alerts and contest reminders need a verified inbox. Send a magic link, open it, then enable notifications.</p>
        </div>

        <EmailLogin
          currentUser={currentUser}
          loading={loading}
          message={authMessage}
          onLogin={onLogin}
          onLogout={onLogout}
        />

        <button className="returnButton" type="button" onClick={onBack}>
          Return to board
        </button>
      </section>
    </main>
  );
}

function SourceManifest({
  expanded,
  preferences,
  onToggleExpanded,
  onUpdatePreference,
  sources
}: {
  expanded: boolean;
  preferences: Record<string, UserPreference>;
  onToggleExpanded: () => void;
  onUpdatePreference: (sourceId: string, patch: Partial<Pick<UserPreference, "visible" | "emailEnabled">>) => void;
  sources: Source[];
}) {
  return (
    <section className={expanded ? "sourceManifest expanded" : "sourceManifest"} aria-label="Subscribed routes">
      <button
        className="manifestToggle"
        type="button"
        aria-expanded={expanded}
        onClick={onToggleExpanded}
      >
        <span>{sources.length} SOURCES</span>
        <b>{expanded ? "CLOSE" : "MANAGE"} ›</b>
      </button>

      <div className="manifestBody">
        <div className="manifestRows">
          {sources.map((source) => (
            <div className="manifestRow" key={source.id}>
              <span>
                <b>{source.label}</b>
                <small>{source.type} / {source.newCount} new</small>
              </span>

              <label className="manifestControl">
                <input
                  checked={preferences[source.id]?.visible !== false}
                  onChange={(event) => onUpdatePreference(source.id, { visible: event.target.checked })}
                  type="checkbox"
                />
                <small>SHOW</small>
              </label>

              <button
                className="manifestControl bellControl"
                type="button"
                aria-pressed={Boolean(preferences[source.id]?.emailEnabled)}
                onClick={() => onUpdatePreference(source.id, { emailEnabled: !preferences[source.id]?.emailEnabled })}
              >
                {preferences[source.id]?.emailEnabled ? <Bell size={15} /> : <BellOff size={15} />}
                <small>EMAIL</small>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DisplayControls({
  settings,
  onChange
}: {
  settings: DisplaySettings;
  onChange: (settings: DisplaySettings) => void;
}) {
  return (
    <section className="displayControls" aria-label="Card display controls">
      <div className="displayTitle">
        <SlidersHorizontal size={15} />
        <span>Display</span>
      </div>

      <label>
        <span>Style</span>
        <select
          value={settings.style}
          onChange={(event) => onChange({ ...settings, style: event.target.value as DisplayStyle })}
        >
          <option value="ticket">Ticket</option>
          <option value="board">Board</option>
          <option value="list">List</option>
        </select>
      </label>

      <label>
        <Columns size={15} />
        <span>Columns</span>
        <select
          value={settings.columns}
          onChange={(event) => onChange({ ...settings, columns: event.target.value as GridColumns })}
        >
          <option value="auto">Auto</option>
          <option value="1">1 column</option>
          <option value="2">2 columns</option>
          <option value="3">3 columns</option>
        </select>
      </label>

      <label>
        <span>Size</span>
        <select
          value={settings.size}
          onChange={(event) => onChange({ ...settings, size: event.target.value as CardSize })}
        >
          <option value="compact">Compact</option>
          <option value="standard">Standard</option>
          <option value="large">Large</option>
        </select>
      </label>
    </section>
  );
}

function DeparturesHeader({
  authLoading,
  authMessage,
  currentUser,
  dark,
  error,
  health,
  lastSynced,
  newCount,
  onLogin,
  onLoginNavigate,
  onLogout,
  onRefresh,
  onSearchChange,
  onSortChange,
  onToggleDark,
  refreshing,
  search,
  sortBy
}: {
  authLoading: boolean;
  authMessage: string | null;
  currentUser: User | null;
  dark: boolean;
  error: string | null;
  health: Health | null;
  lastSynced: string;
  newCount: number;
  onLogin: (email: string) => void;
  onLoginNavigate: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: SortBy) => void;
  onToggleDark: () => void;
  refreshing: boolean;
  search: string;
  sortBy: SortBy;
}) {
  const syncFailed = Boolean(error || health?.lastRun?.status.includes("error"));

  return (
    <header className="departuresHeader">
      <div className="departureBrand">
        <span className="brandMark" aria-hidden="true">
          <Milestone size={23} strokeWidth={2.3} />
          <i />
        </span>
        <div>
          <h1>Opportunity Departures</h1>
          <p>Jobs and coding contests board</p>
        </div>
      </div>

      <div className="headerBoard">
        <div className="splitCounter" aria-label={`${newCount} new opportunities`}>
          <span>{String(newCount).padStart(2, "0")}</span>
          <small>NEW</small>
        </div>
        <div className="syncTicker">
          <span>{lastSynced}</span>
          {syncFailed ? (
            <b>
              Last sync failed
              {health?.lastRun?.endedAt ? ` - cached from ${formatRelative(health.lastRun.endedAt)}` : ""}
            </b>
          ) : null}
        </div>
      </div>

      <div className="accountSlot">
        {currentUser ? (
          <EmailLogin
            currentUser={currentUser}
            loading={authLoading}
            message={authMessage}
            onLogin={onLogin}
            onLogout={onLogout}
          />
        ) : (
          <button
            className="loginNotice"
            type="button"
            onClick={onLoginNavigate}
          >
            Login first to set reminders
            <br />
            and save notification preferences.
          </button>
        )}
      </div>

      <div className="controls">
        <TicketLookupInput value={search} onChange={onSearchChange} />

        <select value={sortBy} onChange={(event) => onSortChange(event.target.value as SortBy)}>
          <option value="newest">First seen newest</option>
          <option value="new_first">New/unseen first</option>
          <option value="posted_newest">Posted newest</option>
          <option value="posted_oldest">Posted oldest</option>
          <option value="deadline">Deadline soonest</option>
          <option value="deadline_latest">Deadline latest</option>
          <option value="company_az">Company A-Z</option>
          <option value="company_za">Company Z-A</option>
          <option value="title_az">Role A-Z</option>
          <option value="title_za">Role Z-A</option>
        </select>

        <button className="iconButton" onClick={onRefresh} aria-label="Refresh jobs">
          <RefreshCw size={18} className={refreshing ? "spin" : ""} />
        </button>

        <button className="iconButton" onClick={onToggleDark} aria-label="Toggle dark mode">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}

function TicketData({
  alert,
  label,
  value
}: {
  alert?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={alert ? "ticketData alertData" : "ticketData"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function shareTextFor(item: TicketItem) {
  const details = item.data
    .slice(0, 3)
    .map((field) => `${field.label}: ${field.value}`)
    .join(" | ");

  return `${item.title} - ${item.subtitle}\n${details}\n${item.url}`;
}

function TicketCard({
  contestReminderActive,
  item,
  onToggleContestReminder
}: {
  contestReminderActive?: boolean;
  item: TicketItem;
  onToggleContestReminder?: (item: Extract<TicketItem, { kind: "contest" }>) => void;
}) {
  const [tearing, setTearing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const bars = useMemo(() => barcodeBars(item.id), [item.id]);
  const contestStartsAt = item.kind === "contest" ? item.startsAt : null;
  const dateStamp = contestStartsAt ? formatDateStamp(contestStartsAt) : null;

  const openItem = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }

    setTearing(true);
    window.setTimeout(() => {
      window.open(item.url, "_blank", "noopener,noreferrer");
      setTearing(false);
    }, 120);
  };

  const shareItem = async () => {
    const text = shareTextFor(item);

    if (navigator.share) {
      await navigator.share({
        title: item.title,
        text,
        url: item.url
      });
      return;
    }

    await navigator.clipboard.writeText(text);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1400);
  };

  return (
    <article className={`ticketCard ${item.isNew ? "ticketNewArrival" : ""} ${tearing ? "tearing" : ""}`}>
      <div className="ticketMain">
        {item.isNew || dateStamp ? (
          <div className="stampStack">
            {dateStamp ? <span className="dateStamp">{dateStamp}</span> : null}
            {item.isNew ? <span className="newStamp">NEW</span> : null}
          </div>
        ) : null}
        <div className="ticketTopline">
          <div className="ticketRoute">{item.route}</div>
        </div>
        <h2>{item.title}</h2>
        <p className="ticketCompany">{item.subtitle}</p>

        <div className="ticketDataGrid">
          {item.data.map((field) => (
            <TicketData alert={field.alert} key={field.label} label={field.label} value={field.value} />
          ))}
        </div>
      </div>

      <div className="perforation" aria-hidden="true" />

      <aside className="ticketStub">
        <div className="barcode" aria-hidden="true">
          {bars.map((bar, index) => (
            <span
              key={`${item.id}-${index}`}
              style={{ width: `${bar.width}px`, height: `${bar.height}px` }}
            />
          ))}
        </div>
        <span className="stubCode">ID {item.id.slice(0, 24)}</span>
        {item.kind === "contest" ? (
          <button
            className={contestReminderActive ? "reminderTicket active" : "reminderTicket"}
            type="button"
            onClick={() => onToggleContestReminder?.(item)}
          >
            {contestReminderActive ? <BellOff size={16} /> : <Bell size={16} />}
            <span>{contestReminderActive ? "Reminder set" : "Notify"}</span>
          </button>
        ) : null}
        <button className={shareCopied ? "shareTicket active" : "shareTicket"} type="button" onClick={shareItem}>
          <Share2 size={16} />
          <span>{shareCopied ? "Copied" : "Share"}</span>
        </button>
        <a className="applyTicket" href={item.url} onClick={openItem}>
          <span>{item.action}</span>
          <ArrowUpRight size={18} />
        </a>
      </aside>
    </article>
  );
}

function TicketSkeleton() {
  return (
    <article className="ticketCard ticketSkeleton" aria-hidden="true">
      <div className="ticketMain">
        <span className="skeletonLine routeLine" />
        <span className="skeletonLine titleLine" />
        <span className="skeletonLine companyLine" />
        <div className="ticketDataGrid">
          <span className="skeletonBlock" />
          <span className="skeletonBlock" />
          <span className="skeletonBlock" />
          <span className="skeletonBlock" />
        </div>
      </div>
      <div className="perforation" />
      <aside className="ticketStub">
        <span className="skeletonBarcode" />
        <span className="skeletonButton" />
      </aside>
    </article>
  );
}

function toJobTicket(job: Job): TicketItem {
  return {
    kind: "job",
    id: job.id,
    sourceId: job.sourceId,
    title: job.title,
    subtitle: job.company,
    url: job.applyUrl,
    isNew: job.isNew,
    firstSeenAt: job.firstSeenAt,
    route: "JOB / SOFTWARE DEVELOPMENT",
    action: "Apply",
    data: [
      { label: "Location", value: job.location ?? "Not listed" },
      { label: "Mode", value: prettyToken(job.jobType) },
      { label: "Posted", value: formatRelative(job.postedAt) },
      { label: "Deadline", value: formatDate(job.deadline), alert: isDeadlineSoon(job.deadline) }
    ]
  };
}

function toContestTicket(contest: Contest): TicketItem {
  const siteLabel = formatSiteLabel(contest.site);
  const status = contestStatus(contest);
  return {
    kind: "contest",
    id: contest.id,
    sourceId: contestSourceId(contest.site),
    title: contest.name,
    subtitle: siteLabel,
    url: contest.url,
    isNew: contest.isNew,
    firstSeenAt: contest.firstSeenAt,
    startsAt: contest.startTime,
    route: "CONTEST / CODING PLATFORM",
    action: "Register",
    data: [
      { label: "Platform", value: siteLabel },
      { label: "Starts", value: formatCountdown(contest.startTime) },
      { label: "Date", value: formatDateTime(contest.startTime) },
      { label: "Duration", value: formatDuration(contest.durationSec) },
      { label: "Status", value: status }
    ]
  };
}

function CinematicLanding({
  currentUser,
  onContinue,
  onLogin
}: {
  currentUser: User | null;
  onContinue: () => void;
  onLogin: () => void;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const primaryVideoRef = useRef<HTMLVideoElement | null>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState({ primary: false, secondary: false });
  const [showScrollCue, setShowScrollCue] = useState(true);

  useEffect(() => {
    const primaryVideo = primaryVideoRef.current;
    const secondaryVideo = secondaryVideoRef.current;
    const section = sectionRef.current;
    if (!primaryVideo || !secondaryVideo || !section) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isFallback = () => mediaQuery.matches;
    let frame = 0;
    let lastPrimaryTime = -1;
    let lastSecondaryTime = -1;

    const setVideoMix = (primaryOpacity: number, secondaryOpacity: number) => {
      section.style.setProperty("--primary-video-opacity", String(primaryOpacity));
      section.style.setProperty("--secondary-video-opacity", String(secondaryOpacity));
    };

    const sceneOpacity = (progress: number, start: number, peakStart: number, peakEnd: number, end: number) => {
      if (progress <= start || progress >= end) return 0;
      if (progress >= peakStart && progress <= peakEnd) return 1;
      if (progress < peakStart) return (progress - start) / (peakStart - start);
      return (end - progress) / (end - peakEnd);
    };

    const setSceneProgress = (progress: number) => {
      section.style.setProperty("--scene-intro", String(sceneOpacity(progress, 0, 0.04, 0.24, 0.34)));
      section.style.setProperty("--scene-sources", String(sceneOpacity(progress, 0.28, 0.36, 0.52, 0.64)));
      section.style.setProperty("--scene-actions", String(sceneOpacity(progress, 0.58, 0.68, 0.92, 1)));
    };

    const pauseVideos = () => {
      primaryVideo.pause();
      secondaryVideo.pause();
    };

    const seekIfNeeded = (video: HTMLVideoElement, nextTime: number, lastTime: number) => {
      if (!Number.isFinite(nextTime) || !video.duration || video.readyState < 1) return lastTime;
      if (Math.abs(nextTime - lastTime) < 0.045) return lastTime;

      try {
        video.currentTime = Math.min(video.duration, Math.max(0, nextTime));
      } catch {
        return lastTime;
      }
      return nextTime;
    };

    const syncVideoToScroll = () => {
      if (isFallback()) return;

      const rect = section.getBoundingClientRect();
      const scrollable = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
      const primaryProgress = Math.min(1, progress / 0.54);
      const secondaryProgress = Math.min(1, Math.max(0, (progress - 0.46) / (CINEMATIC_SCRUB_END_PROGRESS - 0.46)));
      const secondaryAvailable = secondaryVideo.readyState >= 1 && Boolean(secondaryVideo.duration);
      const crossfade = secondaryAvailable ? Math.min(1, Math.max(0, (progress - 0.46) / 0.12)) : 0;
      const primaryOpacity = 1 - crossfade;
      const secondaryOpacity = crossfade;
      setSceneProgress(progress);

      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        pauseVideos();
        return;
      }

      pauseVideos();
      if (primaryOpacity > 0.02) {
        lastPrimaryTime = seekIfNeeded(primaryVideo, primaryProgress * primaryVideo.duration, lastPrimaryTime);
      }
      if (secondaryOpacity > 0.02) {
        lastSecondaryTime = seekIfNeeded(secondaryVideo, secondaryProgress * secondaryVideo.duration, lastSecondaryTime);
      }
      setVideoMix(primaryOpacity, secondaryOpacity);
    };

    const requestSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncVideoToScroll);
    };

    const configurePlayback = () => {
      if (isFallback()) {
        setVideoMix(1, 0);
        setSceneProgress(0.08);
        if (primaryVideo.readyState >= 1) primaryVideo.currentTime = 0;
        if (secondaryVideo.readyState >= 1) secondaryVideo.currentTime = 0;
        void primaryVideo.play().catch(() => undefined);
        secondaryVideo.pause();
        return;
      }

      pauseVideos();
      requestSync();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          configurePlayback();
          return;
        }

        pauseVideos();
      },
      { threshold: 0.05 }
    );

    observer.observe(section);
    configurePlayback();
    primaryVideo.addEventListener("loadedmetadata", requestSync);
    secondaryVideo.addEventListener("loadedmetadata", requestSync);
    window.addEventListener("scroll", requestSync, { passive: true });
    window.addEventListener("resize", configurePlayback);
    mediaQuery.addEventListener("change", configurePlayback);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      primaryVideo.removeEventListener("loadedmetadata", requestSync);
      secondaryVideo.removeEventListener("loadedmetadata", requestSync);
      window.removeEventListener("scroll", requestSync);
      window.removeEventListener("resize", configurePlayback);
      mediaQuery.removeEventListener("change", configurePlayback);
    };
  }, []);

  useEffect(() => {
    if (!showScrollCue) return;

    const hideCue = () => {
      if (window.scrollY > 24) setShowScrollCue(false);
    };
    const hideCueImmediately = () => setShowScrollCue(false);
    const hideCueOnKey = (event: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", " ", "Spacebar"].includes(event.key)) hideCueImmediately();
    };

    window.addEventListener("scroll", hideCue, { passive: true });
    window.addEventListener("wheel", hideCueImmediately, { passive: true, once: true });
    window.addEventListener("touchmove", hideCueImmediately, { passive: true, once: true });
    window.addEventListener("keydown", hideCueOnKey);

    return () => {
      window.removeEventListener("scroll", hideCue);
      window.removeEventListener("wheel", hideCueImmediately);
      window.removeEventListener("touchmove", hideCueImmediately);
      window.removeEventListener("keydown", hideCueOnKey);
    };
  }, [showScrollCue]);

  const advanceCinematicScroll = () => {
    setShowScrollCue(false);
    window.scrollBy({ top: Math.round(window.innerHeight * 0.72), behavior: "smooth" });
  };

  return (
    <>
      <section className="cinematicLanding" ref={sectionRef} aria-label="Opportunity Departures introduction">
        <div className="cinematicSticky">
          <div className="cinematicFrame">
            {!videoReady.primary ? (
              <div className="videoPoster" aria-hidden="true">
                <span>OPPORTUNITY DEPARTURES</span>
              </div>
            ) : null}
            <video
              aria-label="Cinematic preview of Opportunity Departures"
              className={videoReady.primary ? "heroVideo videoPrimary ready" : "heroVideo videoPrimary"}
              muted
              playsInline
              preload="metadata"
              ref={primaryVideoRef}
              onCanPlay={() => setVideoReady((current) => ({ ...current, primary: true }))}
            >
              <source src="/Create_a_premium_cinematic_D.mp4" type="video/mp4" />
            </video>
            <video
              aria-label="Dashboard transition preview"
              className={videoReady.secondary ? "heroVideo videoSecondary ready" : "heroVideo videoSecondary"}
              muted
              playsInline
              preload="metadata"
              ref={secondaryVideoRef}
              onCanPlay={() => setVideoReady((current) => ({ ...current, secondary: true }))}
            >
              <source src="/Video_Project.mp4" type="video/mp4" />
            </video>
          </div>

          <div className="sceneCopy sceneCopyIntro">
            <h1>Opportunity Departures</h1>
            <p>Jobs and coding contests arrive like routes on a departures board, then settle into ticket-style cards.</p>
          </div>

          <div className="sceneCopy sceneCopySources">
            <span>AUTOMATIC SOURCES</span>
            <p>Supabase cron jobs collect Unstop, HackerEarth, MyCareerNet, CodeChef, AtCoder, LeetCode, and Codeforces updates.</p>
          </div>

          <div className="sceneCopy sceneCopyActions">
            <span>READY TO ACT</span>
            <p>Filter the board, share a ticket, open Apply or Register, and set reminders before contests start.</p>
          </div>

          {showScrollCue ? (
            <button className="scrollCue" type="button" onClick={advanceCinematicScroll} aria-label="Scroll to explore">
              <span>Scroll</span>
              <ChevronDown size={22} />
            </button>
          ) : null}
        </div>
      </section>

      <section className="landingExplainer" aria-label="What Opportunity Departures does">
        <div>
          <span>WHY IT MATTERS</span>
          <h2>One board for scattered opportunities.</h2>
          <p>Instead of checking every platform manually, the app keeps a synced board of jobs, featured opportunities, and coding contests.</p>
        </div>
        <div>
          <span>CONTROL</span>
          <h2>Filters, layouts, and sharing stay close.</h2>
          <p>Switch between jobs, contests, and all sources. Choose a display style, share useful cards, and keep the board tidy.</p>
        </div>
        <div>
          <span>REMINDERS</span>
          <h2>Contest alerts use verified email.</h2>
          <p>Login with email before enabling reminders, then the scheduled reminder worker sends alerts near contest start time.</p>
        </div>
      </section>

      <section className="landingCta" aria-label="Get started">
        <span>{currentUser ? "SIGNED IN" : "GET STARTED"}</span>
        <h2>{currentUser ? "Your departures board is ready." : "Login once, then set reminders."}</h2>
        <p>Open the live dashboard to browse current jobs and contests. Login is only required for reminders and saved notification preferences.</p>
        <div className="landingActions">
          <button type="button" onClick={currentUser ? onContinue : onLogin}>
            {currentUser ? "Go to dashboard" : "Login / Get started"}
          </button>
          <button className="secondaryAction" type="button" onClick={onContinue}>
            Continue without login
          </button>
        </div>
      </section>
    </>
  );
}

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("jobs");
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>({
    columns: "auto",
    size: "standard",
    style: "ticket"
  });
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceManifestExpanded, setSourceManifestExpanded] = useState(false);
  const [userPreferences, setUserPreferences] = useState<Record<string, UserPreference>>({});
  const [contestReminders, setContestReminders] = useState<Set<string>>(new Set());
  const [visibleNewBySource, setVisibleNewBySource] = useState<Record<string, VisibleNewCount>>({});
  const [newCountClock, setNewCountClock] = useState(Date.now());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [route, setRoute] = useState(() => window.location.pathname);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const id = window.setInterval(() => setNewCountClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const seenAt = Date.now();
    const activeSourceIds = new Set(sources.map((source) => source.id));

    setVisibleNewBySource((current) => {
      let changed = false;
      const next: Record<string, VisibleNewCount> = {};

      for (const [sourceId, value] of Object.entries(current)) {
        if (activeSourceIds.has(sourceId)) next[sourceId] = value;
        else changed = true;
      }

      for (const source of sources) {
        const run = source.lastRun;
        if (!run || displayRunStatus(run.status) !== "SUCCESS" || run.jobsInserted <= 0) continue;

        const runKey = `${run.startedAt}:${run.endedAt ?? ""}:${run.jobsInserted}`;
        if (next[source.id]?.runKey === runKey) continue;

        next[source.id] = {
          count: run.jobsInserted,
          expiresAt: seenAt + NEW_COUNT_VISIBLE_MS,
          runKey
        };
        changed = true;
      }

      return changed ? next : current;
    });
  }, [sources]);

  const navigateTo = (nextRoute: string) => {
    setRoute(nextRoute);
    if (window.location.pathname !== nextRoute) {
      window.history.pushState({}, "", nextRoute);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const goToLogin = (message = "Login first to use notifications.") => {
    setAuthMessage(message);
    navigateTo("/login");
  };

  const returnToBoard = () => {
    navigateTo("/dashboard");
  };

  const continueToDashboard = () => {
    navigateTo("/dashboard");
  };

  const loadStatus = async () => {
    const [sourceResult, jobCountResult, contestCountResult, runResult] = await Promise.all([
      supabase.from("source_with_status").select("*").order("type").order("label"),
      supabase.from("job").select("id", { count: "exact", head: true }),
      supabase.from("contest").select("id", { count: "exact", head: true }),
      supabase.from("scrape_run").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle()
    ]);
    if (sourceResult.error) throw sourceResult.error;
    if (jobCountResult.error) throw jobCountResult.error;
    if (contestCountResult.error) throw contestCountResult.error;
    if (runResult.error) throw runResult.error;

    setSources((sourceResult.data ?? []).map(mapSource));
    setHealth({
      ok: true,
      jobCount: jobCountResult.count ?? 0,
      lastRun: mapRun(runResult.data)
    });
  };

  const applyUserState = (state: UserState) => {
    setCurrentUser(state.user);
    setUserPreferences(
      Object.fromEntries(state.preferences.map((preference) => [preference.sourceId, preference]))
    );
    setContestReminders(new Set(state.reminders));
  };

  const loadUserState = async () => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error("Login required");
      const [preferences, reminders] = await Promise.all([
        supabase.from("user_source_preference").select("source_id,visible,email_enabled"),
        supabase.from("contest_reminder").select("contest_id")
      ]);
      if (preferences.error) throw preferences.error;
      if (reminders.error) throw reminders.error;
      applyUserState({
        user: {
          id: userData.user.id,
          email: userData.user.email ?? "",
          createdAt: userData.user.created_at,
          lastLoginAt: userData.user.last_sign_in_at ?? userData.user.created_at
        },
        preferences: (preferences.data ?? []).map((preference) => ({
          sourceId: preference.source_id,
          visible: preference.visible,
          emailEnabled: preference.email_enabled
        })),
        reminders: (reminders.data ?? []).map((reminder) => reminder.contest_id)
      });
    } catch {
      setCurrentUser(null);
      setUserPreferences({});
      setContestReminders(new Set());
    }
  };

  const loadJobs = async () => {
    let query = supabase.from("job").select("*").limit(100);
    if (sortBy === "new_first") query = query.order("is_new", { ascending: false }).order("first_seen_at", { ascending: false });
    else if (sortBy === "posted_newest") query = query.order("posted_at", { ascending: false, nullsFirst: false });
    else if (sortBy === "posted_oldest") query = query.order("posted_at", { ascending: true, nullsFirst: false });
    else if (sortBy === "deadline") query = query.order("deadline", { ascending: true, nullsFirst: false });
    else if (sortBy === "deadline_latest") query = query.order("deadline", { ascending: false, nullsFirst: false });
    else if (sortBy === "company_az") query = query.order("company", { ascending: true }).order("title");
    else if (sortBy === "company_za") query = query.order("company", { ascending: false }).order("title");
    else if (sortBy === "title_az") query = query.order("title", { ascending: true }).order("company");
    else if (sortBy === "title_za") query = query.order("title", { ascending: false }).order("company");
    else query = query.order("first_seen_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    setJobs((data ?? []).map(mapJob).filter((job) => !isJobExpired(job)));
  };

  const loadContests = async () => {
    const { data, error } = await supabase.from("contest").select("*").order("start_time", { ascending: true }).limit(100);
    if (error) throw error;
    setContests((data ?? []).map(mapContest).filter((contest) => !isContestEnded(contest)));
  };

  const refreshAll = async (showRefreshing = false) => {
    try {
      setError(null);
      if (showRefreshing) setRefreshing(true);
      await Promise.all([loadJobs(), loadContests(), loadStatus(), loadUserState()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updateSourcePreference = async (
    sourceId: string,
    patch: Partial<Pick<UserPreference, "visible" | "emailEnabled">>
  ) => {
    if (!currentUser) {
      if (patch.emailEnabled) {
        goToLogin("Login first to enable email alerts.");
        return;
      }
      setError("Login with email to save source preferences.");
      return;
    }

    const { error: upsertError } = await supabase.from("user_source_preference").upsert({
      user_id: currentUser.id,
      source_id: sourceId,
      visible: patch.visible ?? userPreferences[sourceId]?.visible ?? true,
      email_enabled: patch.emailEnabled ?? userPreferences[sourceId]?.emailEnabled ?? false
    }, {
      onConflict: "user_id,source_id"
    });

    if (upsertError) throw upsertError;
    setUserPreferences((current) => ({
      ...current,
      [sourceId]: {
        sourceId,
        visible: patch.visible ?? current[sourceId]?.visible ?? true,
        emailEnabled: patch.emailEnabled ?? current[sourceId]?.emailEnabled ?? false
      }
    }));
  };

  const loginWithEmail = async (email: string) => {
    try {
      setAuthLoading(true);
      setError(null);
      setAuthMessage(null);
      const { error: loginError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin }
      });

      if (loginError) throw loginError;

      setAuthMessage("Check your email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setAuthMessage(null);
    setUserPreferences({});
    setContestReminders(new Set());
  };

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const code = queryParams.get("code");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (!code && (!accessToken || !refreshToken)) return;

    const verifyLogin = async () => {
      try {
        setAuthLoading(true);
        setError(null);
        const { error: verifyError } = code
          ? await supabase.auth.exchangeCodeForSession(code)
          : await supabase.auth.setSession({
              access_token: accessToken!,
              refresh_token: refreshToken!
            });
        if (verifyError) throw verifyError;
        await loadUserState();
        setAuthMessage("Signed in");
        setRoute("/dashboard");
        window.history.replaceState({}, "", "/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login verification failed");
      } finally {
        setAuthLoading(false);
      }
    };

    void verifyLogin();
  }, []);

  const toggleContestReminder = async (item: Extract<TicketItem, { kind: "contest" }>) => {
    if (!currentUser) {
      goToLogin("Login first to set contest reminders.");
      return;
    }

    const enabled = !contestReminders.has(item.id);
    const notifyAt = new Date(Math.max(Date.now(), new Date(item.startsAt).getTime() - 60 * 60 * 1000)).toISOString();
    const { error: reminderError } = enabled
      ? await supabase.from("contest_reminder").upsert({
          user_id: currentUser.id,
          contest_id: item.id,
          notify_at: notifyAt
        }, { onConflict: "user_id,contest_id" })
      : await supabase.from("contest_reminder").delete().eq("contest_id", item.id);

    if (reminderError) throw reminderError;
    setContestReminders((current) => {
      const next = new Set(current);
      if (enabled) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
  };

  useEffect(() => {
    void refreshAll();
  }, [sortBy]);

  useEffect(() => {
    const id = window.setInterval(() => {
      loadStatus().catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const lastSynced = useMemo(() => {
    if (!health?.lastRun?.endedAt) return "Never synced";
    return `Synced ${formatRelative(health.lastRun.endedAt)}`;
  }, [health]);

  const availableSources = useMemo(() => {
    const visibleSources = sources.filter((source) => source.enabled && userPreferences[source.id]?.visible !== false);
    if (viewMode === "jobs") return visibleSources.filter((source) => source.type === "JOB");
    if (viewMode === "contests") return visibleSources.filter((source) => source.type === "CONTEST");
    return visibleSources;
  }, [sources, userPreferences, viewMode]);

  const statusSources = useMemo(() => {
    if (!selectedSourceId) return availableSources;
    return availableSources.filter((source) => source.id === selectedSourceId);
  }, [availableSources, selectedSourceId]);

  const visibleNewCounts = useMemo(
    () =>
      Object.fromEntries(
        sources.map((source) => {
          const visible = visibleNewBySource[source.id];
          return [source.id, visible && visible.expiresAt > newCountClock ? visible.count : 0];
        })
      ) as Record<string, number>,
    [newCountClock, sources, visibleNewBySource]
  );

  const statusText = useMemo(() => {
    if (statusSources.length === 1) return formatSourceStatus(statusSources[0], visibleNewCounts[statusSources[0].id] ?? 0);
    return formatAggregateStatus(statusSources, visibleNewCounts);
  }, [statusSources, visibleNewCounts]);

  const statusHasError = useMemo(
    () => Boolean(error || statusSources.some((source) => source.lastRun && displayRunStatus(source.lastRun.status) === "ERROR")),
    [error, statusSources]
  );

  useEffect(() => {
    const availableIds = new Set(availableSources.map((source) => source.id));
    setSelectedSourceId((current) => (current && !availableIds.has(current) ? null : current));
  }, [availableSources]);

  const tickets = useMemo(() => {
    const jobTickets = viewMode === "contests" ? [] : jobs.map(toJobTicket);
    const contestTickets = viewMode === "jobs" ? [] : contests.map(toContestTicket);
    const allItems = [...jobTickets, ...contestTickets];
    const query = debouncedSearch.toLowerCase();

    // For each source, only the most recent N items (where N = jobsInserted
    // from the latest successful run) should keep the NEW stamp.
    // This way old cards lose NEW when a fresh batch arrives.
    const insertedBySource: Record<string, number> = {};
    for (const source of sources) {
      if (source.lastRun && displayRunStatus(source.lastRun.status) === "SUCCESS") {
        insertedBySource[source.id] = source.lastRun.jobsInserted;
      }
    }

    // Collect isNew items per source, sorted newest-first by firstSeenAt
    const newItemsBySource: Record<string, Array<{ firstSeenAt: string; id: string }>> = {};
    for (const item of allItems) {
      if (item.isNew) {
        (newItemsBySource[item.sourceId] ??= []).push({ firstSeenAt: item.firstSeenAt, id: item.id });
      }
    }

    // Build a set of item IDs that should actually keep the NEW stamp
    const allowedNewIds = new Set<string>();
    for (const [sourceId, items] of Object.entries(newItemsBySource)) {
      const limit = insertedBySource[sourceId];
      // Sort newest first
      items.sort((a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime());
      // If we know how many were inserted, only keep that many; otherwise none are new
      const keep = limit != null ? Math.min(limit, items.length) : 0;
      for (let i = 0; i < keep; i++) {
        allowedNewIds.add(items[i].id);
      }
    }

    return allItems
      .map((item) => {
        if (item.isNew && !allowedNewIds.has(item.id)) {
          return { ...item, isNew: false };
        }
        return item;
      })
      .filter((item) => {
        const matchesSearch = !query || `${item.title} ${item.subtitle}`.toLowerCase().includes(query);
        const matchesSource = !selectedSourceId || item.sourceId === selectedSourceId;
        return matchesSearch && matchesSource;
      });
  }, [contests, debouncedSearch, jobs, selectedSourceId, sources, viewMode]);

  const newCount = useMemo(
    () => sources.reduce((total, source) => total + (visibleNewCounts[source.id] ?? 0), 0),
    [sources, visibleNewCounts]
  );
  const gridClassName = `grid cardSize-${displaySettings.size} displayStyle-${displaySettings.style}`;

  if (route === "/login" && !currentUser) {
    return (
      <LoginScreen
        authMessage={authMessage}
        currentUser={currentUser}
        loading={authLoading}
        onBack={returnToBoard}
        onLogin={loginWithEmail}
        onLogout={logout}
      />
    );
  }

  if (route !== "/dashboard") {
    return (
      <main>
        <CinematicLanding
          currentUser={currentUser}
          onContinue={continueToDashboard}
          onLogin={() => goToLogin("Login first to set reminders and save notification preferences.")}
        />
      </main>
    );
  }

  return (
    <main>
      <div id="departures-board" className="boardShell">
        <DeparturesHeader
        authLoading={authLoading}
        authMessage={authMessage}
        currentUser={currentUser}
        dark={dark}
        error={error}
        health={health}
        lastSynced={lastSynced}
        newCount={newCount}
        onLogin={loginWithEmail}
        onLoginNavigate={() => goToLogin("Login first to set reminders and save notification preferences.")}
        onLogout={logout}
        onRefresh={() => refreshAll(true)}
        onSearchChange={setSearch}
        onSortChange={setSortBy}
        onToggleDark={() => setDark((value) => !value)}
        refreshing={refreshing}
        search={search}
        sortBy={sortBy}
      />

      <SourceManifest
        expanded={sourceManifestExpanded}
        preferences={userPreferences}
        onToggleExpanded={() => setSourceManifestExpanded((value) => !value)}
        onUpdatePreference={(sourceId, patch) => {
          updateSourcePreference(sourceId, patch).catch((err) =>
            setError(err instanceof Error ? err.message : "Preference update failed")
          );
        }}
        sources={sources}
      />

      <section className="filterDeck" aria-label="Filters and sync status">
        <div className="viewSwitch" aria-label="View mode">
          {(["jobs", "contests", "all"] as const).map((mode) => (
            <button
              className={viewMode === mode ? "active" : ""}
              key={mode}
              onClick={() => setViewMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="sourceChips" aria-label="Source filters">
          {availableSources.map((source) => (
            <button
              className={selectedSourceId === source.id ? "active" : ""}
              key={source.id}
              onClick={() => setSelectedSourceId((current) => (current === source.id ? null : source.id))}
            >
              {source.label}
            </button>
          ))}
        </div>

        <DisplayControls settings={displaySettings} onChange={setDisplaySettings} />
      </section>

      <section className="statusLine">
        <span className={statusHasError ? "dot errorDot" : "dot"} />
        <span>{statusText}</span>
      </section>

      {loading ? (
        <section className={gridClassName} data-columns={displaySettings.columns}>
          {Array.from({ length: 4 }).map((_, index) => (
            <TicketSkeleton key={index} />
          ))}
        </section>
      ) : tickets.length === 0 ? (
        <section className="message">NO TICKETS MATCH THAT SEARCH. TRY A DIFFERENT ROUTE.</section>
      ) : (
        <section className={gridClassName} data-columns={displaySettings.columns}>
          {tickets.map((item) => (
            <TicketCard
              contestReminderActive={item.kind === "contest" ? contestReminders.has(item.id) : false}
              item={item}
              key={`${item.kind}:${item.id}`}
              onToggleContestReminder={toggleContestReminder}
            />
          ))}
        </section>
      )}
      </div>
    </main>
  );
}
