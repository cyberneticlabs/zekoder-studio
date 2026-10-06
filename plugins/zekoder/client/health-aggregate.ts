import type { CodingHealthReport } from "../shared/reports.js";

/** Same filters as the org-health web page: day range, one repo, one contributor, bots. */
export interface HealthFilters {
  /** Inclusive day indexes into `report.window.days`. */
  from: number;
  to: number;
  /** Index into `report.repos`, or -1 for all. */
  repo: number;
  /** Index into `report.users`, or -1 for all. */
  user: number;
  bots: boolean;
}

export interface Bucket {
  commits: number;
  add: number;
  del: number;
  merged: number;
  closed: number;
  prAdd: number;
  prDel: number;
}

export interface Aggregate {
  total: Bucket;
  byDay: Bucket[];
  byUser: Map<number, Bucket>;
  byRepo: Map<number, Bucket>;
}

export const blank = (): Bucket => ({ commits: 0, add: 0, del: 0, merged: 0, closed: 0, prAdd: 0, prDel: 0 });

export function defaultFilters(report: CodingHealthReport): HealthFilters {
  return { from: 0, to: Math.max(0, report.window.days.length - 1), repo: -1, user: -1, bots: false };
}

/** Same rule as the web page's `keep`: a picked contributor stays visible even if it is a bot. */
function keep(report: CodingHealthReport, f: HealthFilters, row: number[]): boolean {
  if (row[0] < f.from || row[0] > f.to) return false;
  if (f.repo >= 0 && row[1] !== f.repo) return false;
  if (f.user >= 0 && row[2] !== f.user) return false;
  if (!f.bots && report.users[row[2]]?.bot && f.user !== row[2]) return false;
  return true;
}

export function aggregate(report: CodingHealthReport, f: HealthFilters): Aggregate {
  const total = blank();
  const byDay = report.window.days.map(blank);
  const byUser = new Map<number, Bucket>();
  const byRepo = new Map<number, Bucket>();
  const buckets = (row: number[]) => {
    const user = byUser.get(row[2]) ?? byUser.set(row[2], blank()).get(row[2])!;
    const repo = byRepo.get(row[1]) ?? byRepo.set(row[1], blank()).get(row[1])!;
    return [total, byDay[row[0]], user, repo].filter(Boolean);
  };

  for (const row of report.commits) {
    if (!keep(report, f, row)) continue;
    for (const b of buckets(row)) {
      b.commits += row[3];
      b.add += row[4];
      b.del += row[5];
    }
  }
  for (const row of report.pulls) {
    if (!keep(report, f, row)) continue;
    for (const b of buckets(row)) {
      b.merged += row[3];
      b.closed += row[4];
      b.prAdd += row[5];
      b.prDel += row[6];
    }
  }
  return { total, byDay, byUser, byRepo };
}

export const isActive = (b: Bucket) => b.commits + b.merged + b.closed > 0;

export function avg(sum: number, count: number): number {
  return count ? sum / count : 0;
}
