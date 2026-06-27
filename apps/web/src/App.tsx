import {
  ArrowUpRight,
  Bell,
  BellOff,
  Columns,
  Milestone,
  Moon,
  RefreshCw,
  Search,
  Share2,
  SlidersHorizontal,
  Sun
} from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";

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

type TicketItem =
  | {
      kind: "job";
      id: string;
      sourceId: string;
      title: string;
      subtitle: string;
      url: string;
      isNew: boolean;
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
      data: Array<{ label: string; value: string; alert?: boolean }>;
      route: string;
      action: string;
      startsAt: string;
    };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function displayRunStatus(status: string) {
  return status.split(":")[0].toUpperCase();
}

function formatSourceStatus(source: Source) {
  if (!source.lastRun) return `${source.label.toUpperCase()}: NO SCRAPER RUNS YET`;
  return `${displayRunStatus(source.lastRun.status)}: ${source.label.toUpperCase()} ${source.lastRun.jobsFound} FOUND, ${source.lastRun.jobsInserted} NEW`;
}

function formatAggregateStatus(sources: Source[]) {
  const runs = sources.map((source) => source.lastRun).filter((run): run is ScrapeRun => Boolean(run));
  if (runs.length === 0) return "NO SCRAPER RUNS YET";

  const found = runs.reduce((total, run) => total + run.jobsFound, 0);
  const inserted = runs.reduce((total, run) => total + run.jobsInserted, 0);
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
  const newTotal = sources.reduce((total, source) => total + source.newCount, 0);

  return (
    <section className={expanded ? "sourceManifest expanded" : "sourceManifest"} aria-label="Subscribed routes">
      <button
        className="manifestToggle"
        type="button"
        aria-expanded={expanded}
        onClick={onToggleExpanded}
      >
        <span>{sources.length} SOURCES</span>
        <span>{newTotal} NEW</span>
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
        <EmailLogin
          currentUser={currentUser}
          loading={authLoading}
          message={authMessage}
          onLogin={onLogin}
          onLogout={onLogout}
        />
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
  const status = new Date(contest.startTime).getTime() <= Date.now() ? "Running" : "Upcoming";
  return {
    kind: "contest",
    id: contest.id,
    sourceId: contestSourceId(contest.site),
    title: contest.name,
    subtitle: siteLabel,
    url: contest.url,
    isNew: contest.isNew,
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

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [jobNewCount, setJobNewCount] = useState(0);
  const [contestNewCount, setContestNewCount] = useState(0);
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [showLoginPage, setShowLoginPage] = useState(() => window.location.pathname === "/login");
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
    const onPopState = () => setShowLoginPage(window.location.pathname === "/login");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const goToLogin = (message = "Login first to use notifications.") => {
    setAuthMessage(message);
    setShowLoginPage(true);
    if (window.location.pathname !== "/login") {
      window.history.pushState({}, "", "/login");
    }
  };

  const returnToBoard = () => {
    setShowLoginPage(false);
    if (window.location.pathname !== "/") {
      window.history.pushState({}, "", "/");
    }
  };

  const loadStatus = async () => {
    const [healthData, newJobs, newContests, sourceData] = await Promise.all([
      getJson<Health>("/api/health"),
      getJson<{ count: number }>("/api/jobs/new"),
      getJson<{ count: number }>("/api/contests/new"),
      getJson<{ data: Source[] }>("/api/sources")
    ]);
    setHealth(healthData);
    setJobNewCount(newJobs.count);
    setContestNewCount(newContests.count);
    setSources(sourceData.data);
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
      const state = await getJson<UserState>("/api/users/me/state");
      applyUserState(state);
    } catch {
      setCurrentUser(null);
      setUserPreferences({});
      setContestReminders(new Set());
    }
  };

  const loadJobs = async () => {
    const params = new URLSearchParams({
      page: "1",
      limit: "100",
      sortBy
    });

    const data = await getJson<JobsResponse>(`/api/jobs?${params.toString()}`);
    setJobs(data.data);
    const visibleNewIds = data.data.filter((job) => job.isNew).map((job) => job.id);

    if (visibleNewIds.length > 0) {
      window.setTimeout(() => {
        fetch(`${API_BASE}/api/jobs/mark-seen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: visibleNewIds })
        })
          .then(() => loadStatus())
          .catch(() => undefined);
      }, 1200);
    }
  };

  const loadContests = async () => {
    const data = await getJson<ContestsResponse>("/api/contests?page=1&limit=100&sortBy=start_asc");
    setContests(data.data);
    const visibleNewIds = data.data.filter((contest) => contest.isNew).map((contest) => contest.id);

    if (visibleNewIds.length > 0) {
      window.setTimeout(() => {
        fetch(`${API_BASE}/api/contests/mark-seen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: visibleNewIds })
        })
          .then(() => loadStatus())
          .catch(() => undefined);
      }, 1200);
    }
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

    const response = await fetch(`${API_BASE}/api/users/me/preferences`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, ...patch })
    });

    if (!response.ok) throw new Error("Preference update failed");
    const body = (await response.json()) as { preference: UserPreference };
    setUserPreferences((current) => ({ ...current, [sourceId]: body.preference }));
  };

  const loginWithEmail = async (email: string) => {
    try {
      setAuthLoading(true);
      setError(null);
      setAuthMessage(null);
      const data = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      if (!data.ok) throw new Error("Enter a valid email address.");

      setAuthMessage("Check your email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
    setCurrentUser(null);
    setAuthMessage(null);
    setUserPreferences({});
    setContestReminders(new Set());
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (window.location.pathname !== "/auth/verify" || !token) return;

    const verifyLogin = async () => {
      try {
        setAuthLoading(true);
        setError(null);
        const response = await fetch(`${API_BASE}/api/auth/verify`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });

        if (!response.ok) throw new Error("Login link is invalid or expired.");
        await loadUserState();
        setAuthMessage("Signed in");
        setShowLoginPage(false);
        window.history.replaceState({}, "", "/");
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
    const response = await fetch(`${API_BASE}/api/users/me/reminders`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contestId: item.id, enabled })
    });

    if (!response.ok) throw new Error("Reminder update failed");
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

  const statusText = useMemo(() => {
    if (statusSources.length === 1) return formatSourceStatus(statusSources[0]);
    return formatAggregateStatus(statusSources);
  }, [statusSources]);

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
    const query = debouncedSearch.toLowerCase();

    return [...jobTickets, ...contestTickets].filter((item) => {
      const matchesSearch = !query || `${item.title} ${item.subtitle}`.toLowerCase().includes(query);
      const matchesSource = !selectedSourceId || item.sourceId === selectedSourceId;
      return matchesSearch && matchesSource;
    });
  }, [contests, debouncedSearch, jobs, selectedSourceId, viewMode]);

  const newCount = jobNewCount + contestNewCount;
  const gridClassName = `grid cardSize-${displaySettings.size} displayStyle-${displaySettings.style}`;

  if (showLoginPage && !currentUser) {
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

  return (
    <main>
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
    </main>
  );
}
