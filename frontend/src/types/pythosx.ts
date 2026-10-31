/**
 * Types for the `pythosx` block returned by POST /api/analyze.
 * Mirrors worker/src/pythosx.ts (the worker is the source of truth).
 */

export type RoastLevel = 'friendly' | 'spicy' | 'brutal';
export const ROAST_LEVELS: RoastLevel[] = ['friendly', 'spicy', 'brutal'];
export const ROAST_LEVEL_LABELS: Record<RoastLevel, string> = {
  friendly: 'Friendly Roast',
  spicy: 'Spicy Roast',
  brutal: 'Brutal Code Review',
};
export type RoastSet = Record<RoastLevel, string[]>;
export type RepoCategory = 'recent' | 'starred';

export interface ReadmeReality {
  exists: boolean | null;
  score: number;
  words: number;
  setupQuality: 'Missing' | 'Basic' | 'Clear' | 'Unknown';
  explanationQuality: 'Missing' | 'Thin' | 'Clear' | 'Thorough' | 'Unknown';
  presentSections: string[];
  missingSections: string[];
  verdict: string;
}

export type ActivityLevel = 'Active' | 'Warm' | 'Cooling' | 'Dormant' | 'Ghost';
export interface GhostReport {
  lastUpdated: string | null;
  lastPush: string | null;
  daysSincePush: number | null;
  activityLevel: ActivityLevel;
  isArchived: boolean;
  concerns: string[];
  comment: string;
}

export interface TestingReport {
  status: 'Tests found' | 'Light coverage signals' | 'On vacation' | 'Unknown';
  testFileCount: number;
  hasCI: boolean;
  hasCoverageConfig: boolean;
  qualityScore: number;
  missingSignals: string[];
  recommendations: string[];
  verdict: string;
}

export interface StarVsSubstance {
  stars: number;
  score: number;
  popularityTier: 'Quiet' | 'Small' | 'Growing' | 'Popular' | 'Very popular';
  substanceTier: 'Early' | 'Developing' | 'Solid' | 'Strong';
  relation: 'aligned' | 'popularity-ahead' | 'substance-ahead';
  observation: string;
}

export interface RepoSection {
  key: 'code' | 'architecture' | 'documentation' | 'testing' | 'security' | 'dependencies' | 'maintenance' | 'production';
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

export interface PresenceComponent { key: string; label: string; score: number; weight: number; evidence: string }

export interface ProfessionalReview {
  snapshot: {
    name: string | null;
    username: string;
    bio: string | null;
    accountCreatedAt: string | null;
    accountAgeYears: number | null;
    publicRepos: number;
    totalStars: number;
    starsScope: 'all' | 'sampled';
    followers: number;
    contributions: { totalCommits: number; totalPRs: number; calendarTotal: number; window: string } | null;
    organizations: number;
    pinnedRepos: number;
    dominantLanguages: Array<{ name: string; pct: number }>;
    website: string | null;
    company: string | null;
    location: string | null;
  };
  presenceScore: { overall: number; label: string; components: PresenceComponent[]; method: string[]; disclaimer: string };
  strengths: Array<{ title: string; detail: string }>;
  improvements: Array<{ title: string; detail: string; impact: 'High' | 'Medium' | 'Low' }>;
  verdict: { impression: string; strongestArea: string; biggestWeakness: string; mostValuableImprovement: string; nextStep: string };
}

export interface PythosXReport {
  version: 1;
  generatedAt: string;
  aiEnhanced: boolean;
  professionalReview: ProfessionalReview;
  repositoryIntelligence: {
    status: 'ok' | 'empty' | 'unavailable';
    message: string | null;
    repositories: RepoReview[];
    selection: { recentCount: number; starredCount: number; overlapCount: number; note: string };
  };
  profileRoasts: RoastSet;
  funnyVerdict: Record<RoastLevel, string>;
}
