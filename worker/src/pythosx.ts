/**
 * PythosX Intelligence — pure, deterministic analysis helpers.
 *
 * Everything in this file is side-effect free (no network, no clock unless a
 * `now` value is injected) so it can be unit tested and reused by both the
 * Cloudflare Worker and the Vercel Edge handler.
 *
 * Rules the module follows:
 *  - Only evidence that was actually fetched is reported. No sample data.
 *  - Roasts target code, docs and practices — never the person.
 *  - Roasts are generated from findings and rotate by a stable hash seed, so
 *    different repositories/developers get different lines.
 */

import type { AdvancedAnalysis, FileSignal, TreeItem } from "./analysisCore";

export const PYTHOSX_URL = "https://github.com/PythosX";

export type RoastLevel = "friendly" | "spicy" | "brutal";
export const ROAST_LEVELS: RoastLevel[] = ["friendly", "spicy", "brutal"];
export type RepoCategory = "recent" | "starred";
export type RoastSet = Record<RoastLevel, string[]>;

// ── Utilities ────────────────────────────────────────────────────────────────

export function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(items: T[], seed: string): T {
  return items[hashString(seed) % items.length] as T;
}

function fill(template: string, tokens: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(tokens[key] ?? ""));
}

export function gradeFromScore(score: number): string {
  if (score >= 99) return "S";
  if (score >= 88) return "A+";
  if (score >= 75) return "A";
  if (score >= 63) return "A-";
  if (score >= 50) return "B+";
  if (score >= 38) return "B";
  if (score >= 25) return "B-";
  if (score >= 13) return "C+";
  return "C";
}

function timestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysBetween(now: number, then: number): number {
  if (!then) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

// ── Repository selection ─────────────────────────────────────────────────────

export interface PythosXGraphqlRepo {
  name: string;
  nameWithOwner: string;
  description?: string | null;
  url?: string | null;
  homepageUrl?: string | null;
  stargazerCount?: number;
  forkCount?: number;
  diskUsage?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  pushedAt?: string | null;
  isArchived?: boolean;
  isFork?: boolean;
  primaryLanguage?: { name?: string | null } | null;
  defaultBranchRef?: { name?: string | null } | null;
  licenseInfo?: { spdxId?: string | null; name?: string | null } | null;
  issues?: { totalCount?: number };
  languages?: { edges?: Array<{ size?: number; node?: { name?: string } }> };
  repositoryTopics?: { nodes?: Array<{ topic?: { name?: string } }> };
}

export interface RepoCandidateLists {
  /** Original (non-fork) repos ordered by UPDATED_AT desc. */
  recent: PythosXGraphqlRepo[];
  /** Forks ordered by UPDATED_AT desc — only used when originals run out. */
  recentForks: PythosXGraphqlRepo[];
  /** Original repos ordered by STARGAZERS desc. */
  starred: PythosXGraphqlRepo[];
  /** Forks ordered by STARGAZERS desc — only used when originals run out. */
  starredForks: PythosXGraphqlRepo[];
}

export interface SelectedRepo {
  repo: PythosXGraphqlRepo;
  categories: RepoCategory[];
  labels: string[];
}

export interface RepoSelectionResult {
  selected: SelectedRepo[];
  recentCount: number;
  starredCount: number;
  overlapCount: number;
}

const repoKey = (repo: PythosXGraphqlRepo) => (repo.nameWithOwner || repo.name || "").toLowerCase();

function dedupe(repos: PythosXGraphqlRepo[]): PythosXGraphqlRepo[] {
  const seen = new Set<string>();
  const out: PythosXGraphqlRepo[] = [];
  for (const repo of repos) {
    if (!repo || !repo.name) continue;
    const key = repoKey(repo);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(repo);
  }
  return out;
}

const byUpdatedDesc = (a: PythosXGraphqlRepo, b: PythosXGraphqlRepo) =>
  timestamp(b.updatedAt) - timestamp(a.updatedAt) || repoKey(a).localeCompare(repoKey(b));

const byStarsDesc = (a: PythosXGraphqlRepo, b: PythosXGraphqlRepo) =>
  (b.stargazerCount || 0) - (a.stargazerCount || 0) || byUpdatedDesc(a, b);

/**
 * Picks the 3 most recently updated and 2 most-starred repositories.
 * - Originals are preferred; forks only fill remaining slots.
 * - "Most starred" never includes repos with zero stars (nothing to rank).
 * - A repository present in both lists is returned once with both categories.
 */
export function selectRepositories(lists: RepoCandidateLists, recentLimit = 3, starredLimit = 2): RepoSelectionResult {
  const recentOriginals = dedupe(lists.recent).sort(byUpdatedDesc);
  const recentForks = dedupe(lists.recentForks).sort(byUpdatedDesc);
  const recentPick = [...recentOriginals, ...recentForks.filter((fork) => !recentOriginals.some((r) => repoKey(r) === repoKey(fork)))].slice(0, recentLimit);

  const starredOriginals = dedupe(lists.starred).filter((repo) => (repo.stargazerCount || 0) > 0).sort(byStarsDesc);
  const starredForks = dedupe(lists.starredForks).filter((repo) => (repo.stargazerCount || 0) > 0).sort(byStarsDesc);
  const starredPick = [...starredOriginals, ...starredForks.filter((fork) => !starredOriginals.some((r) => repoKey(r) === repoKey(fork)))].slice(0, starredLimit);

  const merged = new Map<string, SelectedRepo>();
  recentPick.forEach((repo, index) => {
    merged.set(repoKey(repo), { repo, categories: ["recent"], labels: [`Latest Repository ${String(index + 1).padStart(2, "0")}`] });
  });

  let overlapCount = 0;
  starredPick.forEach((repo, index) => {
    const label = `Most Starred Repository ${String(index + 1).padStart(2, "0")}`;
    const existing = merged.get(repoKey(repo));
    if (existing) {
      existing.categories.push("starred");
      existing.labels.push(label);
      overlapCount += 1;
    } else {
      merged.set(repoKey(repo), { repo, categories: ["starred"], labels: [label] });
    }
  });

  return {
    selected: Array.from(merged.values()),
    recentCount: recentPick.length,
    starredCount: starredPick.length,
    overlapCount,
  };
}

// ── Tree / README evidence ───────────────────────────────────────────────────

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|rb|php|cs|cpp|cc|c|h|hpp|swift|dart|vue|svelte|scala|lua|ex|exs|sol)$/i;
const IGNORED_DIR = /(^|\/)(node_modules|dist|build|vendor|\.git|coverage|target|__pycache__|\.next|out)\//i;
const TEST_PATH = /(^|\/)(tests?|__tests__|spec|specs|e2e|cypress)\/|\.(test|spec)\.[a-z0-9]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py|rb|rs)$|Tests?\.(java|cs|kt)$/i;
const COVERAGE_PATH = /(^|\/)(\.coveragerc|codecov\.ya?ml|\.nycrc(\.json)?|jest\.config\.[a-z]+|vitest\.config\.[a-z]+|pytest\.ini|tox\.ini|karma\.conf\.[a-z]+)$/i;

export interface TreeSignals {
  treeAvailable: boolean;
  testFileCount: number;
  sourceFileCount: number;
  hasWorkflows: boolean;
  hasLicenseFile: boolean;
  hasContributing: boolean;
  hasDocsDir: boolean;
  hasDockerfile: boolean;
  hasChangelog: boolean;
  hasCoverageConfig: boolean;
  readmePath: string | null;
}

export function analyzeTree(tree: TreeItem[]): TreeSignals {
  const paths = tree
    .filter((item) => item.type === "blob" && item.path)
    .map((item) => String(item.path).replace(/\\/g, "/"));
  const visible = paths.filter((path) => !IGNORED_DIR.test(path));
  const readmePath = paths.find((path) => /^readme(\.(md|markdown|rst|txt|adoc))?$/i.test(path)) || null;
  return {
    treeAvailable: paths.length > 0,
    testFileCount: visible.filter((path) => TEST_PATH.test(path)).length,
    sourceFileCount: visible.filter((path) => SOURCE_EXT.test(path) && !TEST_PATH.test(path)).length,
    hasWorkflows: paths.some((path) => /^\.github\/workflows\/.+\.ya?ml$/i.test(path)) || paths.some((path) => /^(\.gitlab-ci\.yml|\.circleci\/config\.yml|azure-pipelines\.yml|jenkinsfile)$/i.test(path)),
    hasLicenseFile: paths.some((path) => /^(license|licence|copying)(\.[a-z]+)?$/i.test(path)),
    hasContributing: paths.some((path) => /^contributing(\.[a-z]+)?$/i.test(path)),
    hasDocsDir: paths.some((path) => /^docs?\//i.test(path)),
    hasDockerfile: paths.some((path) => /(^|\/)dockerfile$/i.test(path)),
    hasChangelog: paths.some((path) => /^changelog(\.[a-z]+)?$/i.test(path)),
    hasCoverageConfig: visible.some((path) => COVERAGE_PATH.test(path)),
    readmePath,
  };
}

const README_SECTIONS: Array<{ key: string; label: string; weight: number; pattern: RegExp }> = [
  { key: "install", label: "Installation / setup", weight: 12, pattern: /(install|setup|set up|getting started|quick ?start|prerequisite|requirements)/i },
  { key: "usage", label: "Usage / examples", weight: 12, pattern: /(usage|how to use|example|running|run the|commands)/i },
  { key: "features", label: "Features overview", weight: 6, pattern: /(features|highlights|capabilities|what it does|why )/i },
  { key: "demo", label: "Screenshots / demo", weight: 8, pattern: /(screenshot|demo|preview|live site|!\[[^\]]*\]\()/i },
  { key: "config", label: "Configuration", weight: 5, pattern: /(configuration|environment variables|\.env|config)/i },
  { key: "testing", label: "Testing instructions", weight: 4, pattern: /(\btests?\b|testing|pytest|vitest|jest)/i },
  { key: "contributing", label: "Contributing guide", weight: 4, pattern: /(contributing|contribute|pull request)/i },
  { key: "license", label: "License", weight: 4, pattern: /(licen[sc]e|mit license|apache)/i },
];

export interface ReadmeReality {
  exists: boolean | null;
  score: number;
  words: number;
  setupQuality: "Missing" | "Basic" | "Clear" | "Unknown";
  explanationQuality: "Missing" | "Thin" | "Clear" | "Thorough" | "Unknown";
  presentSections: string[];
  missingSections: string[];
  verdict: string;
}

export function analyzeReadme(text: string | null, treeAvailable: boolean, seed: string): ReadmeReality {
  if (!text || !text.trim()) {
    if (!treeAvailable) {
      return {
        exists: null, score: 0, words: 0, setupQuality: "Unknown", explanationQuality: "Unknown",
        presentSections: [], missingSections: [],
        verdict: "The README could not be inspected (GitHub file tree unavailable), so no documentation verdict is given.",
      };
    }
    return {
      exists: false, score: 0, words: 0, setupQuality: "Missing", explanationQuality: "Missing",
      presentSections: [], missingSections: README_SECTIONS.map((section) => section.label),
      verdict: pick([
        "No README at the repository root. Visitors get a file list and a prayer.",
        "A repository without a README is a house without a front door.",
        "The README is on a long break; it has not filed a leave request.",
      ], seed),
    };
  }

  const body = text.slice(0, 60_000);
  const words = (body.replace(/```[\s\S]*?```/g, " ").match(/[A-Za-z0-9_'’-]+/g) || []).length;
  const headings = body.split("\n").filter((line) => /^\s{0,3}#{1,6}\s+\S/.test(line) || /^(=+|-+)\s*$/.test(line));
  const headingText = headings.join("\n");
  const codeBlocks = (body.match(/```/g) || []).length / 2;
  const linkCount = (body.match(/\]\(https?:\/\//g) || []).length;

  const present: string[] = [];
  const missing: string[] = [];
  let sectionPoints = 0;
  for (const section of README_SECTIONS) {
    // Section headings are the strongest signal; keyword-only mentions in prose count for demo/config/testing.
    const inHeading = section.pattern.test(headingText);
    const inBody = section.key === "demo" || section.key === "license" ? section.pattern.test(body) : false;
    if (inHeading || inBody) {
      present.push(section.label);
      sectionPoints += section.weight;
    } else {
      missing.push(section.label);
    }
  }

  const explanationPoints = words >= 250 ? 25 : words >= 120 ? 18 : words >= 40 ? 10 : words >= 15 ? 4 : 0;
  const score = Math.round(clamp(
    explanationPoints
      + sectionPoints
      + (codeBlocks >= 1 ? 8 : 0)
      + (linkCount >= 3 ? 4 : 0)
      + (headings.length >= 4 ? 8 : headings.length >= 2 ? 4 : 0),
  ));

  const hasInstall = present.includes("Installation / setup");
  const hasUsage = present.includes("Usage / examples");
  const setupQuality: ReadmeReality["setupQuality"] = !hasInstall && !hasUsage ? "Missing" : hasInstall && hasUsage && codeBlocks >= 1 ? "Clear" : "Basic";
  const explanationQuality: ReadmeReality["explanationQuality"] = words >= 250 ? "Thorough" : words >= 80 ? "Clear" : "Thin";

  const verdictPool = score >= 75
    ? ["A README that actually explains the project. Newcomers may survive onboarding.", "Documentation is in the building and wearing a name tag. Respect.", "This README does its job: explains, instructs and does not make visitors guess."]
    : score >= 45
      ? ["The README exists and tries — a few more sections and it turns into a real front door.", "Decent README skeleton; the missing sections are where newcomers will get lost.", "Documentation: present, willing, slightly under-caffeinated."]
      : ["Your README is so empty that even the project owner needs documentation to understand it.", "The README says 'hello' and then leaves the room.", "Documentation exists in the same way a lighthouse exists in a desert: technically."];

  return {
    exists: true, score, words, setupQuality, explanationQuality,
    presentSections: present, missingSections: missing,
    verdict: pick(verdictPool, seed),
  };
}

// ── Ghost detector / testing vacation / star vs substance ────────────────────

export type ActivityLevel = "Active" | "Warm" | "Cooling" | "Dormant" | "Ghost";

export interface GhostReport {
  lastUpdated: string | null;
  lastPush: string | null;
  daysSincePush: number | null;
  activityLevel: ActivityLevel;
  isArchived: boolean;
  concerns: string[];
  comment: string;
}

export function buildGhostReport(repo: PythosXGraphqlRepo, now: number, seed: string): GhostReport {
  const lastActivity = timestamp(repo.pushedAt) || timestamp(repo.updatedAt);
  const days = lastActivity ? daysBetween(now, lastActivity) : null;
  const level: ActivityLevel = days === null ? "Ghost" : days <= 30 ? "Active" : days <= 90 ? "Warm" : days <= 180 ? "Cooling" : days <= 365 ? "Dormant" : "Ghost";
  const concerns: string[] = [];
  if (repo.isArchived) concerns.push("Repository is archived — it is read-only, so no further maintenance is expected.");
  if (days !== null && days > 365) concerns.push(`No code push for ${days} days; dependencies and tooling have likely drifted.`);
  else if (days !== null && days > 180) concerns.push(`No code push for ${days} days; maintenance may have slowed down.`);
  if ((repo.issues?.totalCount || 0) > 0 && days !== null && days > 90) concerns.push(`${repo.issues?.totalCount} open issue(s) are waiting while the repository is quiet.`);
  if (days === null) concerns.push("GitHub did not return a push or update timestamp for this repository.");

  const comments: Record<ActivityLevel, string[]> = {
    Active: ["Recently touched and visibly alive. No ghost activity detected.", "Fresh commits, warm repo. The ghosts are on another repository."],
    Warm: ["Not hyperactive, but clearly still breathing.", "Quiet for a bit, not forgotten. A light-rain kind of maintenance."],
    Cooling: ["This repository is slowly drifting into 'I'll get back to it' territory.", "Commit activity has gone from a stream to a drip."],
    Dormant: ["This repository has entered airplane mode.", "Dormant: the last push is old enough to be looking at retirement plans."],
    Ghost: ["Officially a ghost. The last push is old enough to have its own anniversary.", "This repository has left the building and taken the commit history with it."],
  };
  const archivedComment = "Archived on purpose — a retired repository, not a ghost. Make sure the README says so.";
  return {
    lastUpdated: repo.updatedAt || null,
    lastPush: repo.pushedAt || null,
    daysSincePush: days,
    activityLevel: level,
    isArchived: Boolean(repo.isArchived),
    concerns,
    comment: repo.isArchived ? archivedComment : pick(comments[level], seed),
  };
}

export interface TestingReport {
  status: "Tests found" | "Light coverage signals" | "On vacation" | "Unknown";
  testFileCount: number;
  hasCI: boolean;
  hasCoverageConfig: boolean;
  qualityScore: number;
  missingSignals: string[];
  recommendations: string[];
  verdict: string;
}

export function buildTestingReport(tree: TreeSignals, advanced: AdvancedAnalysis, seed: string): TestingReport {
  const qualityScore = Math.round(advanced.testQuality?.score ?? 0);
  if (!tree.treeAvailable) {
    return {
      status: "Unknown", testFileCount: 0, hasCI: false, hasCoverageConfig: false, qualityScore,
      missingSignals: ["GitHub file tree unavailable — test folders could not be verified."],
      recommendations: ["Re-run the analysis later to inspect the repository tree."],
      verdict: "Testing could not be verified for this repository, so the tests get the benefit of the doubt.",
    };
  }
  const missing: string[] = [];
  if (tree.testFileCount === 0) missing.push("No test files or test folders found in the repository tree");
  if (!tree.hasWorkflows) missing.push("No CI workflow running tests on every push");
  if (!tree.hasCoverageConfig && tree.testFileCount > 0) missing.push("No coverage configuration detected");
  for (const gap of (advanced.testQuality?.gaps || []).slice(0, 2)) {
    if (!missing.some((item) => item.toLowerCase() === gap.toLowerCase())) missing.push(gap);
  }
  const status: TestingReport["status"] = tree.testFileCount >= 3 && qualityScore >= 55 ? "Tests found" : tree.testFileCount >= 1 ? "Light coverage signals" : "On vacation";
  const recommendations: string[] = [];
  if (tree.testFileCount === 0) recommendations.push("Add a first smoke test around the most important function or endpoint.");
  if (!tree.hasWorkflows) recommendations.push("Add a CI workflow that runs build, lint and tests on every pull request.");
  if (tree.testFileCount > 0 && !tree.hasCoverageConfig) recommendations.push("Add coverage reporting so gaps become visible.");
  if (recommendations.length === 0) recommendations.push("Keep tests next to risky logic and add regression tests for every bug fix.");

  const verdicts: Record<TestingReport["status"], string[]> = {
    "Tests found": ["Tests actually exist here. The code has a safety net, and it shows.", "Confidence is backed by evidence: test files are in the tree."],
    "Light coverage signals": ["A few tests are present — a good start, though the safety net still has holes.", "Tests exist but are outnumbered by the code they are supposed to guard."],
    "On vacation": ["The code is confident. The tests are nowhere to be found.", "The testing folder is enjoying a permanent vacation."],
    Unknown: ["Testing could not be verified."],
  };
  return {
    status, testFileCount: tree.testFileCount, hasCI: tree.hasWorkflows, hasCoverageConfig: tree.hasCoverageConfig,
    qualityScore, missingSignals: missing.slice(0, 4), recommendations: recommendations.slice(0, 3),
    verdict: pick(verdicts[status], seed),
  };
}

export interface StarVsSubstance {
  stars: number;
  score: number;
  popularityTier: "Quiet" | "Small" | "Growing" | "Popular" | "Very popular";
  substanceTier: "Early" | "Developing" | "Solid" | "Strong";
  relation: "aligned" | "popularity-ahead" | "substance-ahead";
  observation: string;
}

export function buildStarVsSubstance(stars: number, score: number, strengths: string[], weaknesses: string[], seed: string): StarVsSubstance {
  const popularityTier: StarVsSubstance["popularityTier"] = stars >= 1000 ? "Very popular" : stars >= 100 ? "Popular" : stars >= 10 ? "Growing" : stars >= 1 ? "Small" : "Quiet";
  const substanceTier: StarVsSubstance["substanceTier"] = score >= 75 ? "Strong" : score >= 55 ? "Solid" : score >= 35 ? "Developing" : "Early";
  const popRank = { Quiet: 0, Small: 1, Growing: 2, Popular: 3, "Very popular": 4 }[popularityTier];
  const subRank = { Early: 0, Developing: 1, Solid: 2, Strong: 3 }[substanceTier];
  // Map both tiers onto a 0-4 scale for a fair comparison.
  const diff = popRank - Math.round(subRank * (4 / 3));
  const relation: StarVsSubstance["relation"] = diff >= 2 ? "popularity-ahead" : diff <= -2 ? "substance-ahead" : "aligned";
  const strongest = strengths[0] ? `Strongest signal: ${strengths[0].replace(/\.$/, "")}.` : "";
  const weakest = weaknesses[0] ? `Biggest gap: ${weaknesses[0].replace(/\.$/, "")}.` : "";
  const lines: Record<StarVsSubstance["relation"], string[]> = {
    aligned: [
      `${stars} star(s) and a ${score}/100 scan point in the same direction — popularity and substance are roughly in step.`,
      `Stars and scan agree: ${stars} star(s), ${score}/100. No drama between the two.`,
    ],
    "popularity-ahead": [
      `${stars} star(s) is more attention than the ${score}/100 scan alone would predict — popular does not automatically mean polished, and the gaps below are the cheapest way to earn those stars.`,
      `The stars are ahead of the scan (${stars} vs ${score}/100). People like the idea; the engineering hygiene has some catching up to do.`,
    ],
    "substance-ahead": [
      `Only ${stars} star(s), but a ${score}/100 scan — a quiet repository with real substance. Few stars is not a quality verdict; it is mostly a visibility problem.`,
      `A hidden-gem pattern: the scan (${score}/100) is stronger than the star count (${stars}). Better presentation could change that.`,
    ],
  };
  return {
    stars, score, popularityTier, substanceTier, relation,
    observation: [pick(lines[relation], seed), strongest, weakest].filter(Boolean).join(" "),
  };
}

// ── Roast engine ─────────────────────────────────────────────────────────────

export interface RepoSignals {
  name: string;
  score: number;
  stars: number;
  daysSincePush: number | null;
  archived: boolean;
  treeAvailable: boolean;
  readmeExists: boolean | null;
  readmeScore: number;
  hasTests: boolean;
  testFileCount: number;
  hasCI: boolean;
  hasLicense: boolean;
  hasDescription: boolean;
  dependencyCount: number;
  sourceFileCount: number;
  highSecurityCount: number;
  topSecurityTitle: string;
  popularityAhead: boolean;
  substanceAhead: boolean;
}

interface RoastRule {
  key: string;
  severity: number;
  when: (s: RepoSignals) => boolean;
  lines: Record<RoastLevel, string[]>;
}

const ROAST_RULES: RoastRule[] = [
  {
    key: "readme-missing", severity: 95,
    when: (s) => s.treeAvailable && s.readmeExists === false,
    lines: {
      friendly: ["{name} has no README yet — adding one is the cheapest upgrade this repository can get."],
      spicy: ["No README in {name}. Visitors get a file list and a prayer."],
      brutal: ["No README found in {name}. The onboarding plan is apparently 'good luck'."],
    },
  },
  {
    key: "readme-thin", severity: 70,
    when: (s) => s.readmeExists === true && s.readmeScore < 45,
    lines: {
      friendly: ["The README for {name} is a start — setup and usage sections would turn it into a real front door."],
      spicy: ["Your README is so empty that even the project owner needs documentation to understand it."],
      brutal: ["The {name} README explains the project about as well as a commit message that says 'fix'."],
    },
  },
  {
    key: "tests-missing", severity: 90,
    when: (s) => s.treeAvailable && s.testFileCount === 0,
    lines: {
      friendly: ["No test files turned up in {name}. A first smoke test would be a big confidence boost."],
      spicy: ["The code is confident. The tests are nowhere to be found.", "Your testing folder is enjoying a permanent vacation."],
      brutal: ["Zero test files detected in {name}. Shipping on vibes is certainly a strategy."],
    },
  },
  {
    key: "ghost", severity: 80,
    when: (s) => s.daysSincePush !== null && s.daysSincePush > 365 && !s.archived,
    lines: {
      friendly: ["{name} was last pushed {days} days ago — a small refresh would show it is still loved."],
      spicy: ["{name} has entered airplane mode: {days} days since the last push."],
      brutal: ["Your last meaningful update to {name} is old enough to have its own anniversary ({days} days)."],
    },
  },
  {
    key: "cooling", severity: 45,
    when: (s) => s.daysSincePush !== null && s.daysSincePush > 180 && s.daysSincePush <= 365 && !s.archived,
    lines: {
      friendly: ["{name} has been quiet for {days} days — a small maintenance pass would keep it fresh."],
      spicy: ["{days} days without a push: {name} is in a long, thoughtful pause."],
      brutal: ["{days} days of silence in {name}. Even the TODO comments have stopped expecting visitors."],
    },
  },
  {
    key: "deps-heavy", severity: 65,
    when: (s) => s.dependencyCount >= 25 && s.sourceFileCount > 0 && s.dependencyCount > s.sourceFileCount * 2,
    lines: {
      friendly: ["{deps} declared dependencies for {src} source files — worth auditing which ones are really needed."],
      spicy: ["Your repository has more dependencies than actual functionality."],
      brutal: ["{deps} dependencies guarding {src} source files. The dependency list is doing more work than the code."],
    },
  },
  {
    key: "ci-missing", severity: 60,
    when: (s) => s.treeAvailable && !s.hasCI,
    lines: {
      friendly: ["No CI workflow spotted in {name}; one would give every push a free safety net."],
      spicy: ["No CI pipeline in {name}: every merge is a surprise party."],
      brutal: ["No automated checks anywhere in {name}. Production is the test environment."],
    },
  },
  {
    key: "license-missing", severity: 40,
    when: (s) => s.treeAvailable && !s.hasLicense,
    lines: {
      friendly: ["{name} has no license, so others cannot legally reuse it yet."],
      spicy: ["No license: open source in spirit, all-rights-reserved in law."],
      brutal: ["Unlicensed code: a gift nobody is allowed to open."],
    },
  },
  {
    key: "description-missing", severity: 35,
    when: (s) => !s.hasDescription,
    lines: {
      friendly: ["{name} has no repository description — one sentence would help people find it."],
      spicy: ["{name} has no description. The repository is keeping its purpose a secret."],
      brutal: ["No description on {name}. Even the search results are confused."],
    },
  },
  {
    key: "security", severity: 85,
    when: (s) => s.highSecurityCount > 0,
    lines: {
      friendly: ["The scan flagged {sec} high-severity pattern(s) worth a look in {name}: {secTitle}."],
      spicy: ["{sec} high-severity pattern(s) flagged in {name} ({secTitle}). Worth fixing before the internet finds them."],
      brutal: ["{name} tripped {sec} high-severity security pattern(s), starting with: {secTitle}. Fix before someone else reviews it for you."],
    },
  },
  {
    key: "popular-modest", severity: 50,
    when: (s) => s.popularityAhead,
    lines: {
      friendly: ["{stars} star(s) say people like {name}; polishing the basics would make those stars proud."],
      spicy: ["The stars are ahead of the scan for {name}. Popularity is a loan; the engineering has to repay it."],
      brutal: ["{stars} star(s) of goodwill, backed by a {score}/100 scan. Stars are not a test suite."],
    },
  },
  {
    key: "hidden-gem", severity: 30,
    when: (s) => s.substanceAhead,
    lines: {
      friendly: ["{name} is stronger than its {stars} star(s) suggest — a better README and demo could change that."],
      spicy: ["{name} scores {score}/100 and has {stars} star(s). Excellent work, terrible marketing department."],
      brutal: ["{score}/100 under the hood, {stars} star(s) on the badge. The code is good; the PR team is missing."],
    },
  },
];

const POSITIVE_LINES: Record<RoastLevel, string[]> = {
  friendly: ["Docs, tests and activity all showed up for {name}. That is a very good sign."],
  spicy: ["I went looking for something to roast in {name} and found competent engineering. Disappointing."],
  brutal: ["{name} is genuinely hard to roast: the basics are covered. I will keep nitpicking in the recommendations."],
};

export function buildRoasts(signals: RepoSignals, seed: string): RoastSet {
  const tokens = {
    name: signals.name,
    days: signals.daysSincePush ?? "many",
    deps: signals.dependencyCount,
    src: signals.sourceFileCount,
    stars: signals.stars,
    score: signals.score,
    sec: signals.highSecurityCount,
    secTitle: signals.topSecurityTitle || "see the security audit",
  };
  const fired = ROAST_RULES.filter((rule) => rule.when(signals)).sort((a, b) => b.severity - a.severity).slice(0, 3);
  const result: RoastSet = { friendly: [], spicy: [], brutal: [] };
  for (const level of ROAST_LEVELS) {
    if (fired.length === 0) {
      result[level] = [fill(pick(POSITIVE_LINES[level], `${seed}:${level}:ok`), tokens)];
      continue;
    }
    result[level] = fired.map((rule) => fill(pick(rule.lines[level], `${seed}:${level}:${rule.key}`), tokens));
  }
  return result;
}

// ── Repo review ──────────────────────────────────────────────────────────────

export interface RepoSection {
  key: "code" | "architecture" | "documentation" | "testing" | "security" | "dependencies" | "maintenance" | "production";
  label: string;
  score: number | null;
  summary: string;
}

export interface RepoReview {
  id: string;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  categories: RepoCategory[];
  labels: string[];
  isFork: boolean;
  isArchived: boolean;
  stars: number;
  forks: number;
  openIssues: number;
  updatedAt: string | null;
  pushedAt: string | null;
  primaryLanguage: string | null;
  license: string | null;
  topics: string[];
  homepage: string | null;
  score: number;
  grade: string;
  confidence: number;
  languages: Array<{ name: string; pct: number }>;
  sections: RepoSection[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  verdict: string;
  readme: ReadmeReality;
  ghost: GhostReport;
  testing: TestingReport;
  starVsSubstance: StarVsSubstance;
  roasts: RoastSet;
  evidence: { filesScanned: number; treeAvailable: boolean; testFileCount: number; hasCI: boolean; dependencyCount: number; sourceFileCount: number };
}

export interface RepoReviewInput {
  selected: SelectedRepo;
  advanced: AdvancedAnalysis;
  tree: TreeSignals;
  readmeText: string | null;
  files: FileSignal[];
  dependencyCount: number;
  now: number;
}

function maintenanceScore(ghost: GhostReport): number {
  const base = { Active: 92, Warm: 76, Cooling: 55, Dormant: 35, Ghost: 15 }[ghost.activityLevel];
  return ghost.isArchived ? Math.max(base, 40) : base;
}

function firstOr(items: string[] | undefined, fallback: string): string {
  return items && items.length > 0 && items[0] ? items[0] : fallback;
}

export function buildRepoReview(input: RepoReviewInput): RepoReview {
  const { selected, advanced, tree, readmeText, files, dependencyCount, now } = input;
  const repo = selected.repo;
  const seed = repoKey(repo);
  const stars = repo.stargazerCount || 0;
  const metrics = advanced.metrics;
  const score = Math.round(clamp(advanced.algorithmicScore));
  const readme = analyzeReadme(readmeText, tree.treeAvailable, seed);
  const ghost = buildGhostReport(repo, now, seed);
  const testing = buildTestingReport(tree, advanced, seed);
  const license = repo.licenseInfo ? (repo.licenseInfo.spdxId && repo.licenseInfo.spdxId !== "NOASSERTION" ? repo.licenseInfo.spdxId : repo.licenseInfo.name || "Custom") : null;
  const topics = (repo.repositoryTopics?.nodes || []).map((node) => node.topic?.name).filter((name): name is string => Boolean(name));
  const hasLicense = Boolean(license) || tree.hasLicenseFile;
  const hasDescription = Boolean(repo.description && repo.description.trim());

  const securityHigh = (advanced.vulnerabilities || []).filter((item) => item.severity === "critical" || item.severity === "high");
  const docScore = readme.exists === null ? Math.round(metrics.Documentation ?? 0) : Math.round((readme.score * 0.7) + ((metrics.Documentation ?? readme.score) * 0.3));

  // Strengths / weaknesses are only emitted when backed by evidence.
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  if (tree.treeAvailable && tree.testFileCount >= 3) strengths.push(`${tree.testFileCount} test file(s) found in the repository tree.`);
  else if (tree.treeAvailable && tree.testFileCount === 0) { weaknesses.push("No test files found in the repository tree."); recommendations.push("Add a first smoke test for the most important behaviour and run it in CI."); }
  if (tree.hasWorkflows) strengths.push("CI workflow present (automated checks on changes).");
  else if (tree.treeAvailable) { weaknesses.push("No CI workflow detected."); recommendations.push("Add a CI workflow that runs build, lint and tests on every pull request."); }
  if (readme.exists && readme.score >= 70) strengths.push(`README covers ${readme.presentSections.length} of ${README_SECTIONS.length} key sections.`);
  else if (readme.exists === false) { weaknesses.push("README is missing."); recommendations.push("Add a README with a one-paragraph overview, install steps and a usage example."); }
  else if (readme.exists && readme.score < 45) { weaknesses.push(`README is thin (missing: ${readme.missingSections.slice(0, 3).join(", ")}).`); recommendations.push(`Extend the README with ${readme.missingSections.slice(0, 3).join(", ") || "setup and usage"}.`); }
  if (hasLicense) strengths.push(`Licensed (${license || "LICENSE file present"}).`);
  else if (tree.treeAvailable) { weaknesses.push("No license detected."); recommendations.push("Add a LICENSE file so others know how they may reuse the code."); }
  if (ghost.activityLevel === "Active") strengths.push(`Recently active (last push ${ghost.daysSincePush} day(s) ago).`);
  else if ((ghost.activityLevel === "Dormant" || ghost.activityLevel === "Ghost") && !ghost.isArchived) { weaknesses.push(`No push for ${ghost.daysSincePush ?? "many"} days.`); recommendations.push("Do a maintenance pass: update dependencies, close stale issues and note the project status in the README."); }
  if ((metrics.Architecture ?? 0) >= 70) strengths.push(`Architecture signals score ${Math.round(metrics.Architecture ?? 0)}/100.`);
  else if ((metrics.Architecture ?? 100) < 45) weaknesses.push(`Architecture signals are weak (${Math.round(metrics.Architecture ?? 0)}/100).`);
  if (securityHigh.length === 0 && (advanced.securityScore ?? 0) >= 80) strengths.push("No high-severity security patterns in the scanned files.");
  if (securityHigh.length > 0) { weaknesses.push(`${securityHigh.length} high-severity security pattern(s): ${securityHigh[0]?.title}.`); recommendations.push(securityHigh[0]?.recommendation || "Review the flagged security pattern."); }
  if ((advanced.dependencyRisks || []).length > 0) weaknesses.push(`${advanced.dependencyRisks.length} dependency risk signal(s) (e.g. ${advanced.dependencyRisks[0]?.title}).`);
  if (topics.length > 0) strengths.push(`${topics.length} topic tag(s) help discovery.`);
  else recommendations.push("Add repository topics so the project is easier to discover.");
  if (!hasDescription) { weaknesses.push("No repository description."); recommendations.push("Write a one-sentence repository description."); }
  if (strengths.length === 0) strengths.push("Repository is public and reachable; the scan found no standout strengths yet.");
  if (weaknesses.length === 0) weaknesses.push("No major weakness found in the scanned evidence.");

  const starVsSubstance = buildStarVsSubstance(stars, score, strengths, weaknesses, seed);

  const sections: RepoSection[] = [
    { key: "code", label: "Code quality", score: Math.round(metrics.Logic ?? score), summary: firstOr(advanced.codeSmells?.map((s) => s.title), "No major code-smell pattern in the scanned files.") },
    { key: "architecture", label: "Architecture", score: Math.round(metrics.Architecture ?? 0), summary: firstOr(advanced.architectureFindings?.map((s) => s.title), "Limited architecture evidence in the scanned files.") },
    { key: "documentation", label: "Documentation", score: docScore, summary: readme.exists === false ? "README is missing." : readme.exists === null ? "README could not be inspected." : `README score ${readme.score}/100, setup quality: ${readme.setupQuality}.` },
    { key: "testing", label: "Testing quality", score: testing.status === "Unknown" ? null : testing.qualityScore, summary: `${testing.status} — ${testing.testFileCount} test file(s), CI ${testing.hasCI ? "present" : "not detected"}.` },
    { key: "security", label: "Security signals", score: Math.round(advanced.securityScore ?? 0), summary: advanced.vulnerabilities?.length ? `${advanced.vulnerabilities.length} pattern(s) flagged, top: ${advanced.vulnerabilities[0]?.title}.` : "No security pattern flagged in the scanned files." },
    { key: "dependencies", label: "Dependency risk", score: Math.round(metrics.Dependencies ?? 0), summary: advanced.dependencyRisks?.length ? `${advanced.dependencyRisks.length} signal(s), top: ${advanced.dependencyRisks[0]?.title}.` : `${dependencyCount} declared dependenc${dependencyCount === 1 ? "y" : "ies"}, no risk signal found.` },
    { key: "maintenance", label: "Maintenance & activity", score: maintenanceScore(ghost), summary: `${ghost.activityLevel}${ghost.daysSincePush !== null ? ` — last push ${ghost.daysSincePush} day(s) ago` : ""}${ghost.isArchived ? " (archived)" : ""}.` },
    { key: "production", label: "Production readiness", score: Math.round(advanced.productionReadiness?.score ?? metrics.Production ?? 0), summary: firstOr(advanced.productionReadiness?.blockers, firstOr(advanced.productionReadiness?.evidence, "Limited production evidence in the scanned files.")) },
  ];

  const roasts = buildRoasts({
    name: repo.name, score, stars,
    daysSincePush: ghost.daysSincePush, archived: Boolean(repo.isArchived),
    treeAvailable: tree.treeAvailable, readmeExists: readme.exists, readmeScore: readme.score,
    hasTests: tree.testFileCount > 0, testFileCount: tree.testFileCount, hasCI: tree.hasWorkflows,
    hasLicense, hasDescription, dependencyCount, sourceFileCount: tree.sourceFileCount,
    highSecurityCount: securityHigh.length, topSecurityTitle: securityHigh[0]?.title || "",
    popularityAhead: starVsSubstance.relation === "popularity-ahead", substanceAhead: starVsSubstance.relation === "substance-ahead",
  }, seed);

  const grade = gradeFromScore(score);
  const lead = score >= 75 ? "Strong engineering fundamentals" : score >= 55 ? "Solid foundations" : score >= 35 ? "Promising but unfinished" : "Early-stage repository";
  const topStrength = strengths[0]?.replace(/\.$/, "") || "";
  const topWeakness = weaknesses[0]?.replace(/\.$/, "") || "";
  const verdict = `${lead} (${score}/100, grade ${grade}). ${topStrength ? `Best signal: ${topStrength}. ` : ""}${topWeakness && !topWeakness.startsWith("No major") ? `Main gap: ${topWeakness}.` : "No major gap in the scanned evidence."}`;

  const languages = (advanced.languageDistribution || []).slice(0, 6).map((l) => ({ name: l.name, pct: l.pct }));
  const primary = repo.primaryLanguage?.name || languages[0]?.name || null;

  return {
    id: repoKey(repo),
    name: repo.name,
    fullName: repo.nameWithOwner,
    url: repo.url || `https://github.com/${repo.nameWithOwner}`,
    description: hasDescription ? (repo.description as string) : null,
    categories: selected.categories,
    labels: selected.labels,
    isFork: Boolean(repo.isFork),
    isArchived: Boolean(repo.isArchived),
    stars,
    forks: repo.forkCount || 0,
    openIssues: repo.issues?.totalCount || 0,
    updatedAt: repo.updatedAt || null,
    pushedAt: repo.pushedAt || null,
    primaryLanguage: primary,
    license,
    topics,
    homepage: repo.homepageUrl || null,
    score, grade,
    confidence: Math.round(clamp(advanced.confidence)),
    languages, sections,
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    recommendations: Array.from(new Set(recommendations)).slice(0, 5),
    verdict, readme, ghost, testing, starVsSubstance, roasts,
    evidence: {
      filesScanned: files.length, treeAvailable: tree.treeAvailable, testFileCount: tree.testFileCount,
      hasCI: tree.hasWorkflows, dependencyCount, sourceFileCount: tree.sourceFileCount,
    },
  };
}

// ── Professional review ──────────────────────────────────────────────────────

export interface ProfessionalRepoSample {
  stars: number;
  forks: number;
  hasDescription: boolean;
  hasTopics: boolean;
  hasLicense: boolean;
  hasHomepage: boolean;
  archived: boolean;
  updatedAt: string | null;
}

export interface ProfessionalInput {
  username: string;
  details: {
    name: string | null; bio: string | null; company: string | null; location: string | null;
    websiteUrl: string | null; twitterUsername: string | null; createdAt: string | null;
    status: { message: string | null | undefined; emoji: string | null | undefined } | null;
    pinnedItemsCount: number; organizationsCount: number; gistsCount: number;
  } | null;
  followers: number;
  totalPublicRepos: number;
  reposSampled: boolean;
  repos: ProfessionalRepoSample[];
  contributions: { totalCommits: number; totalPRs: number; calendarTotal: number } | null;
  languages: Array<{ name: string; pct: number }>;
  documentationMetric: number | null;
  testingMetric: number | null;
  primaryTrack: string | null;
  now: number;
}

export interface PresenceComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
  evidence: string;
}

export interface ProfessionalReview {
  snapshot: {
    name: string | null; username: string; bio: string | null; accountCreatedAt: string | null; accountAgeYears: number | null;
    publicRepos: number; totalStars: number; starsScope: "all" | "sampled"; followers: number;
    contributions: { totalCommits: number; totalPRs: number; calendarTotal: number; window: string } | null;
    organizations: number; pinnedRepos: number; dominantLanguages: Array<{ name: string; pct: number }>;
    website: string | null; company: string | null; location: string | null;
  };
  presenceScore: { overall: number; label: string; components: PresenceComponent[]; method: string[]; disclaimer: string };
  strengths: Array<{ title: string; detail: string }>;
  improvements: Array<{ title: string; detail: string; impact: "High" | "Medium" | "Low" }>;
  verdict: { impression: string; strongestArea: string; biggestWeakness: string; mostValuableImprovement: string; nextStep: string };
}

const PRESENCE_WEIGHTS: Record<string, number> = {
  completeness: 12, presentation: 12, portfolio: 14, repoPresentation: 12,
  diversity: 10, activity: 14, collaboration: 12, documentation: 14,
};

const pct = (count: number, total: number) => (total > 0 ? count / total : 0);
const logScore = (value: number, factor: number, cap: number) => Math.min(cap, Math.log10(1 + Math.max(0, value)) * factor);

export function buildProfessionalReview(input: ProfessionalInput): ProfessionalReview {
  const { details, repos, now } = input;
  const own = repos.filter((repo) => !repo.archived);
  const sample = repos.slice(0, 20);
  const totalStars = repos.reduce((sum, repo) => sum + repo.stars, 0);
  const totalForks = repos.reduce((sum, repo) => sum + repo.forks, 0);
  const describedPct = pct(sample.filter((r) => r.hasDescription).length, sample.length);
  const topicsPct = pct(sample.filter((r) => r.hasTopics).length, sample.length);
  const licensePct = pct(sample.filter((r) => r.hasLicense).length, sample.length);
  const homepagePct = pct(sample.filter((r) => r.hasHomepage).length, sample.length);
  const newest = repos.reduce((max, repo) => Math.max(max, timestamp(repo.updatedAt)), 0);
  const daysSinceUpdate = newest ? daysBetween(now, newest) : null;
  const significantLanguages = input.languages.filter((language) => language.pct >= 5);
  const topShare = input.languages[0]?.pct ?? 100;

  // 1. Profile completeness
  const completenessParts: Array<[string, boolean, number]> = [
    ["name", Boolean(details?.name), 15], ["bio", Boolean(details?.bio), 25], ["location", Boolean(details?.location), 10],
    ["company", Boolean(details?.company), 10], ["website", Boolean(details?.websiteUrl), 20], ["social link", Boolean(details?.twitterUsername), 5],
    ["status", Boolean(details?.status?.message), 5], ["pinned repositories", (details?.pinnedItemsCount || 0) > 0, 10],
  ];
  const completeness = completenessParts.reduce((sum, [, ok, points]) => sum + (ok ? points : 0), 0);
  const missingFields = completenessParts.filter(([, ok]) => !ok).map(([label]) => label);

  // 2. Professional presentation
  const bioLength = details?.bio?.trim().length || 0;
  const pinned = details?.pinnedItemsCount || 0;
  const presentation = clamp(
    (bioLength >= 40 ? 30 : bioLength >= 15 ? 18 : bioLength > 0 ? 8 : 0)
    + Math.min(pinned, 6) * 5
    + (details?.websiteUrl ? 20 : 0)
    + ((details?.name || "").trim().split(/\s+/).filter(Boolean).length >= 2 ? 10 : details?.name ? 5 : 0)
    + (details?.company || (details?.organizationsCount || 0) > 0 ? 10 : 0),
  );

  // 3. Portfolio quality
  const portfolio = clamp(logScore(totalStars, 16, 40) + Math.min(30, own.length * 3) + describedPct * 30);

  // 4. Repository presentation
  const repoPresentation = sample.length === 0 ? 0 : clamp(describedPct * 40 + topicsPct * 25 + licensePct * 20 + homepagePct * 15);

  // 5. Technical diversity
  const diversity = input.languages.length === 0 ? 0 : clamp(Math.min(70, significantLanguages.length * 14) + (1 - topShare / 100) * 30);

  // 6. Contribution activity
  const contribution = input.contributions;
  const recencyPoints = daysSinceUpdate === null ? 0 : daysSinceUpdate <= 30 ? 30 : daysSinceUpdate <= 90 ? 20 : daysSinceUpdate <= 180 ? 10 : 0;
  const activity = clamp(
    (contribution ? Math.min(50, contribution.calendarTotal / 6) + Math.min(20, contribution.totalCommits / 5) : 0)
    + recencyPoints + (contribution ? 0 : 20),
  );

  // 7. Open-source collaboration
  const collaboration = clamp(
    Math.min(35, (contribution?.totalPRs || 0) * 3.5)
    + Math.min(15, (details?.organizationsCount || 0) * 7.5)
    + logScore(input.followers, 7, 15)
    + logScore(totalForks, 8, 15)
    + logScore(totalStars, 8, 20),
  );

  // 8. Documentation practices
  const documentation = clamp(input.documentationMetric === null ? describedPct * 100 : input.documentationMetric * 0.7 + describedPct * 30);

  const components: PresenceComponent[] = [
    { key: "completeness", label: "GitHub profile completeness", score: Math.round(completeness), weight: PRESENCE_WEIGHTS.completeness as number,
      evidence: missingFields.length === 0 ? "Name, bio, location, company, website, social link, status and pinned repositories are all present." : `Missing: ${missingFields.join(", ")}.` },
    { key: "presentation", label: "Professional presentation", score: Math.round(presentation), weight: PRESENCE_WEIGHTS.presentation as number,
      evidence: `Bio ${bioLength} chars, ${pinned} pinned repo(s), ${details?.websiteUrl ? "website linked" : "no website"}, ${(details?.organizationsCount || 0)} organization(s).` },
    { key: "portfolio", label: "Portfolio quality", score: Math.round(portfolio), weight: PRESENCE_WEIGHTS.portfolio as number,
      evidence: `${totalStars} star(s) across ${repos.length} original repo(s)${input.reposSampled ? " (latest 100 sampled)" : ""}; ${Math.round(describedPct * 100)}% have descriptions.` },
    { key: "repoPresentation", label: "Repository presentation", score: Math.round(repoPresentation), weight: PRESENCE_WEIGHTS.repoPresentation as number,
      evidence: sample.length === 0 ? "No original repositories to evaluate." : `Of ${sample.length} recent repo(s): ${Math.round(describedPct * 100)}% described, ${Math.round(topicsPct * 100)}% with topics, ${Math.round(licensePct * 100)}% licensed, ${Math.round(homepagePct * 100)}% with a homepage/demo link.` },
    { key: "diversity", label: "Technical diversity", score: Math.round(diversity), weight: PRESENCE_WEIGHTS.diversity as number,
      evidence: input.languages.length === 0 ? "No language data returned by GitHub." : `${significantLanguages.length} language(s) above 5% of code; top language ${input.languages[0]?.name} at ${input.languages[0]?.pct}%.` },
    { key: "activity", label: "Contribution activity", score: Math.round(activity), weight: PRESENCE_WEIGHTS.activity as number,
      evidence: contribution ? `${contribution.calendarTotal} contributions and ${contribution.totalCommits} commits in the last 12 months; latest repo update ${daysSinceUpdate === null ? "unknown" : `${daysSinceUpdate} day(s) ago`}.` : `Contribution calendar unavailable; latest repo update ${daysSinceUpdate === null ? "unknown" : `${daysSinceUpdate} day(s) ago`}.` },
    { key: "collaboration", label: "Open-source collaboration", score: Math.round(collaboration), weight: PRESENCE_WEIGHTS.collaboration as number,
      evidence: `${contribution?.totalPRs ?? 0} pull request contribution(s) in 12 months, ${details?.organizationsCount ?? 0} organization(s), ${input.followers} follower(s), ${totalForks} fork(s) of own repos.` },
    { key: "documentation", label: "Documentation practices", score: Math.round(documentation), weight: PRESENCE_WEIGHTS.documentation as number,
      evidence: input.documentationMetric === null ? `Based on repository descriptions only (${Math.round(describedPct * 100)}% described); no README evidence was scanned.` : `PythosX documentation signal ${Math.round(input.documentationMetric)}/100 from scanned READMEs, blended with ${Math.round(describedPct * 100)}% described repositories.` },
  ];

  const overall = Math.round(components.reduce((sum, c) => sum + c.score * c.weight, 0) / components.reduce((sum, c) => sum + c.weight, 0));
  const label = overall >= 85 ? "Exceptional presence" : overall >= 70 ? "Strong presence" : overall >= 55 ? "Solid foundation" : overall >= 40 ? "Developing presence" : "Early-stage presence";

  // Strengths — only components with real evidence behind them.
  const byKey = Object.fromEntries(components.map((c) => [c.key, c])) as Record<string, PresenceComponent>;
  const strengths: ProfessionalReview["strengths"] = [];
  if ((byKey.portfolio?.score ?? 0) >= 70) strengths.push({ title: "Strong technical portfolio", detail: byKey.portfolio?.evidence || "" });
  if ((byKey.activity?.score ?? 0) >= 70) strengths.push({ title: "Consistent project development", detail: byKey.activity?.evidence || "" });
  if ((byKey.diversity?.score ?? 0) >= 65) strengths.push({ title: "Diverse programming experience", detail: byKey.diversity?.evidence || "" });
  if ((byKey.documentation?.score ?? 0) >= 70) strengths.push({ title: "Good repository documentation", detail: byKey.documentation?.evidence || "" });
  if ((byKey.collaboration?.score ?? 0) >= 60 || (contribution?.totalPRs || 0) >= 10 || (details?.organizationsCount || 0) > 0) strengths.push({ title: "Evidence of collaborative development", detail: byKey.collaboration?.evidence || "" });
  if ((byKey.repoPresentation?.score ?? 0) >= 70) strengths.push({ title: "Strong project presentation", detail: byKey.repoPresentation?.evidence || "" });
  if ((byKey.completeness?.score ?? 0) >= 80) strengths.push({ title: "Complete GitHub profile", detail: byKey.completeness?.evidence || "" });
  const uniqueStrengths = strengths.filter((item, index) => strengths.findIndex((other) => other.title === item.title) === index).slice(0, 5);

  // Improvements — concrete and tied to the measured gaps.
  const improvements: ProfessionalReview["improvements"] = [];
  const impactOf = (score: number): "High" | "Medium" | "Low" => (score < 40 ? "High" : score < 60 ? "Medium" : "Low");
  if ((byKey.completeness?.score ?? 100) < 75) improvements.push({ title: "Complete your GitHub profile", detail: `Add ${missingFields.slice(0, 4).join(", ")} so visitors immediately understand who you are.`, impact: impactOf(byKey.completeness?.score ?? 0) });
  if (pinned < 4) improvements.push({ title: "Highlight important projects", detail: `Only ${pinned} repository(ies) are pinned. Pin your 4-6 best projects so they are the first thing visitors see.`, impact: pinned === 0 ? "High" : "Medium" });
  if (sample.length > 0 && describedPct < 0.8) improvements.push({ title: "Organize repository descriptions", detail: `${sample.filter((r) => !r.hasDescription).length} of ${sample.length} recent repositories have no description, and ${sample.filter((r) => !r.hasTopics).length} have no topics.`, impact: impactOf(byKey.repoPresentation?.score ?? 0) });
  if ((byKey.documentation?.score ?? 100) < 65) improvements.push({ title: "Improve repository README files", detail: "Add overview, setup, usage and screenshots to the READMEs of your top projects.", impact: impactOf(byKey.documentation?.score ?? 0) });
  if (input.testingMetric !== null && input.testingMetric < 50) improvements.push({ title: "Improve testing practices", detail: `Testing signal is ${Math.round(input.testingMetric)}/100 in scanned repositories. Add visible tests and a CI workflow.`, impact: input.testingMetric < 30 ? "High" : "Medium" });
  if (sample.length > 0 && homepagePct === 0) improvements.push({ title: "Add project demonstrations", detail: "None of your recent repositories link to a demo or homepage. A live demo or screenshots lifts a project from code to product.", impact: "Medium" });
  if ((byKey.activity?.score ?? 100) < 55) improvements.push({ title: "Improve contribution consistency", detail: byKey.activity?.evidence || "", impact: impactOf(byKey.activity?.score ?? 0) });
  if ((byKey.collaboration?.score ?? 100) < 40) improvements.push({ title: "Show more collaboration", detail: "Contribute to other open-source projects or join an organization to show teamwork, not just solo work.", impact: "Low" });
  const rankedImprovements = improvements
    .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.impact] - { High: 0, Medium: 1, Low: 2 }[b.impact]))
    .slice(0, 6);

  // Verdict
  const weakest = [...components].sort((a, b) => a.score - b.score)[0] as PresenceComponent;
  const topLanguage = input.languages[0];
  const strongestArea = input.primaryTrack || topLanguage
    ? `${input.primaryTrack || "General software"}${topLanguage ? `, led by ${topLanguage.name} (${topLanguage.pct}% of public code)` : ""}`
    : "Not enough public language data to name a strongest area";
  const impressionPool: Record<string, string[]> = {
    high: ["A well-presented public profile with clear evidence of real project work.", "The public GitHub presence reads like a portfolio, not just a code dump."],
    mid: ["A solid public profile with real projects; a few presentation gaps hold the portfolio back.", "Good raw material is visible, but the portfolio could tell its story more clearly."],
    low: ["The public profile is still taking shape; the work that exists is not yet presented to its advantage.", "Early-stage public presence: the foundations are here, the presentation is not yet."],
  };
  const tier = overall >= 70 ? "high" : overall >= 50 ? "mid" : "low";
  const topImprovement = rankedImprovements[0];

  const websiteSet = Boolean(details?.websiteUrl);
  const reviewSnapshot: ProfessionalReview["snapshot"] = {
    name: details?.name || null,
    username: input.username,
    bio: details?.bio || null,
    accountCreatedAt: details?.createdAt || null,
    accountAgeYears: details?.createdAt ? Math.round((daysBetween(now, timestamp(details.createdAt)) / 365.25) * 10) / 10 : null,
    publicRepos: input.totalPublicRepos,
    totalStars,
    starsScope: input.reposSampled ? "sampled" : "all",
    followers: input.followers,
    contributions: contribution ? { totalCommits: contribution.totalCommits, totalPRs: contribution.totalPRs, calendarTotal: contribution.calendarTotal, window: "last 12 months" } : null,
    organizations: details?.organizationsCount || 0,
    pinnedRepos: pinned,
    dominantLanguages: input.languages.slice(0, 5),
    website: websiteSet ? (details?.websiteUrl as string) : null,
    company: details?.company || null,
    location: details?.location || null,
  };

  return {
    snapshot: reviewSnapshot,
    presenceScore: {
      overall, label, components,
      method: [
        "Eight public-evidence components are scored 0-100 and combined with the fixed weights shown beside each bar.",
        "Only data returned by GitHub is used: profile fields, pinned repos, repository metadata, 12-month contribution counts and scanned README signals.",
        "Nothing is inferred about personality, skill beyond public work, or hiring suitability.",
      ],
      disclaimer: "This score reflects how your public GitHub profile is presented. It is not a guarantee of employment, ability or hiring suitability.",
    },
    strengths: uniqueStrengths,
    improvements: rankedImprovements,
    verdict: {
      impression: pick(impressionPool[tier] as string[], input.username),
      strongestArea,
      biggestWeakness: `${weakest.label} (${weakest.score}/100) — ${weakest.evidence}`,
      mostValuableImprovement: topImprovement ? topImprovement.title : "Keep shipping and documenting projects — no single gap stands out.",
      nextStep: topImprovement ? topImprovement.detail : "Pick your best project, add a screenshot, a demo link and a short 'why this exists' paragraph.",
    },
  };
}

// ── Aggregate roasts + funny verdict ─────────────────────────────────────────

const WEAKNESS_CLAUSES: Record<string, Record<RoastLevel, string>> = {
  docs: {
    friendly: "a README refresh would help these projects shine",
    spicy: "your documentation team appears to be missing",
    brutal: "documentation has been reported missing and nobody has filed the paperwork",
  },
  tests: {
    friendly: "a few tests would make the code much easier to trust",
    spicy: "the tests are apparently on a long vacation",
    brutal: "the test suite was last seen in someone's imagination",
  },
  activity: {
    friendly: "a bit more maintenance would keep the projects fresh",
    spicy: "several repositories have quietly entered airplane mode",
    brutal: "some repositories are old enough to be classed as archaeology",
  },
  ci: {
    friendly: "CI would add a free safety net to every push",
    spicy: "every merge is basically a surprise party without CI",
    brutal: "production is the test environment, and CI was not invited",
  },
  none: {
    friendly: "the basics are well covered — the next step is polish",
    spicy: "the basics are covered, which is annoying when you want material",
    brutal: "I looked hard for a flaw and mostly found competence",
  },
};

const OPENERS: Record<"high" | "mid" | "low", Record<RoastLevel, string[]>> = {
  high: {
    friendly: ["Strong engineering fundamentals across these projects"],
    spicy: ["Impressively solid work"],
    brutal: ["Annoyingly competent engineering"],
  },
  mid: {
    friendly: ["Good ideas and decent execution"],
    spicy: ["Good ideas, decent execution"],
    brutal: ["Respectable ideas, uneven execution"],
  },
  low: {
    friendly: ["Promising ideas that are still finding their shape"],
    spicy: ["Ambitious ideas, unfinished execution"],
    brutal: ["Plenty of ideas, very little finishing"],
  },
};

export function buildFunnyVerdict(reviews: RepoReview[], username: string): Record<RoastLevel, string> {
  const result = { friendly: "", spicy: "", brutal: "" } as Record<RoastLevel, string>;
  const flagged = {
    docs: reviews.filter((r) => r.readme.exists !== null && r.readme.score < 45).length,
    tests: reviews.filter((r) => r.testing.status === "On vacation").length,
    activity: reviews.filter((r) => (r.ghost.activityLevel === "Dormant" || r.ghost.activityLevel === "Ghost") && !r.isArchived).length,
    ci: reviews.filter((r) => r.evidence.treeAvailable && !r.evidence.hasCI).length,
  };
  const worst = (Object.entries(flagged) as Array<[keyof typeof flagged, number]>).sort((a, b) => b[1] - a[1])[0];
  const weakKey = worst && worst[1] > 0 ? worst[0] : "none";
  const avg = reviews.length ? reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length : 0;
  const tier = avg >= 70 ? "high" : avg >= 45 ? "mid" : "low";
  for (const level of ROAST_LEVELS) {
    const opener = pick(OPENERS[tier][level], `${username}:${level}:open`);
    const clause = (WEAKNESS_CLAUSES[weakKey] as Record<RoastLevel, string>)[level];
    result[level] = reviews.length === 0
      ? "No repositories were available to review, so there is nothing to roast — yet."
      : `${opener}, but ${clause}.`;
  }
  return result;
}

export function buildProfileRoasts(reviews: RepoReview[], review: ProfessionalReview, username: string): RoastSet {
  const result: RoastSet = { friendly: [], spicy: [], brutal: [] };
  const bioMissing = !review.snapshot.bio;
  const noPins = review.snapshot.pinnedRepos === 0;
  const noSite = !review.snapshot.website;
  const lines: Record<RoastLevel, string[]> = { friendly: [], spicy: [], brutal: [] };
  if (bioMissing) {
    lines.friendly.push("The GitHub bio is empty — one sentence would tell visitors what you build.");
    lines.spicy.push("An empty bio: the profile is playing hard to get.");
    lines.brutal.push("No bio. Recruiters are expected to read minds, apparently.");
  }
  if (noPins) {
    lines.friendly.push("No pinned repositories — pinning your best work is a free portfolio upgrade.");
    lines.spicy.push("Zero pinned repos: the best work is hiding in the back row.");
    lines.brutal.push("Nothing pinned. Your best project is currently a scavenger hunt.");
  }
  if (noSite && lines.friendly.length < 3) {
    lines.friendly.push("A portfolio link would give the profile a proper home page.");
    lines.spicy.push("No website linked: the portfolio exists only in rumours.");
    lines.brutal.push("No website. The portfolio is a rumour.");
  }
  for (const level of ROAST_LEVELS) {
    const repoLines = reviews.slice(0, 2).map((r) => (r.roasts[level][0] || ""));
    result[level] = [...lines[level], ...repoLines].filter(Boolean).slice(0, 3);
    if (result[level].length === 0) {
      result[level] = [pick(POSITIVE_LINES[level], `${username}:${level}:profile`).replace("{name}", username)];
    }
  }
  return result;
}

// ── AI merge (strictly validated) ────────────────────────────────────────────

export interface PythosXAIReview {
  professional_summary?: unknown;
  repos?: unknown;
  funny_verdict?: unknown;
}

export interface PythosXReport {
  version: 1;
  generatedAt: string;
  aiEnhanced: boolean;
  professionalReview: ProfessionalReview;
  repositoryIntelligence: {
    status: "ok" | "empty" | "unavailable";
    message: string | null;
    repositories: RepoReview[];
    selection: { recentCount: number; starredCount: number; overlapCount: number; note: string };
  };
  profileRoasts: RoastSet;
  funnyVerdict: Record<RoastLevel, string>;
}

const cleanText = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length >= 8 && text.length <= max ? text : null;
};

/** Merges optional AI wording into the deterministic report. Never removes facts. */
export function mergeAIReview(report: PythosXReport, ai: PythosXAIReview | null | undefined): PythosXReport {
  if (!ai || typeof ai !== "object") return report;
  let touched = false;

  const summary = cleanText(ai.professional_summary, 600);
  if (summary) {
    report.professionalReview.verdict.impression = summary;
    touched = true;
  }

  if (Array.isArray(ai.repos)) {
    for (const entry of ai.repos as Array<Record<string, unknown>>) {
      if (!entry || typeof entry !== "object") continue;
      const name = typeof entry.name === "string" ? entry.name.toLowerCase() : "";
      const target = report.repositoryIntelligence.repositories.find((repo) => repo.name.toLowerCase() === name);
      if (!target) continue;
      const verdict = cleanText(entry.technical_verdict, 500);
      if (verdict) { target.verdict = verdict; touched = true; }
      for (const level of ROAST_LEVELS) {
        const line = cleanText(entry[`roast_${level}`], 320);
        if (line) { target.roasts[level] = [line, ...target.roasts[level].slice(0, 2)]; touched = true; }
      }
    }
  }

  if (ai.funny_verdict && typeof ai.funny_verdict === "object") {
    for (const level of ROAST_LEVELS) {
      const line = cleanText((ai.funny_verdict as Record<string, unknown>)[level], 320);
      if (line) { report.funnyVerdict[level] = line; touched = true; }
    }
  }

  report.aiEnhanced = touched;
  return report;
}

/** Compact, fact-only payload for the single combined AI request. */
export function buildAIReviewPayload(report: PythosXReport) {
  return {
    username: report.professionalReview.snapshot.username,
    professional: {
      overall: report.professionalReview.presenceScore.overall,
      components: report.professionalReview.presenceScore.components.map((c) => ({ label: c.label, score: c.score, evidence: c.evidence })),
      strengths: report.professionalReview.strengths.map((s) => s.title),
      improvements: report.professionalReview.improvements.map((i) => i.title),
      strongestArea: report.professionalReview.verdict.strongestArea,
    },
    repos: report.repositoryIntelligence.repositories.map((repo) => ({
      name: repo.name,
      score: repo.score,
      grade: repo.grade,
      primaryLanguage: repo.primaryLanguage,
      stars: repo.stars,
      isFork: repo.isFork,
      isArchived: repo.isArchived,
      daysSincePush: repo.ghost.daysSincePush,
      readmeScore: repo.readme.exists === null ? null : repo.readme.score,
      testFiles: repo.testing.status === "Unknown" ? null : repo.testing.testFileCount,
      hasCI: repo.evidence.treeAvailable ? repo.evidence.hasCI : null,
      license: repo.license,
      strengths: repo.strengths.slice(0, 3),
      weaknesses: repo.weaknesses.slice(0, 3),
    })),
  };
}
