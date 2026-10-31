import { describe, it, expect } from "vitest";
import {
  selectRepositories,
  analyzeTree,
  analyzeReadme,
  buildGhostReport,
  buildFunnyVerdict,
  mergeAIReview,
  type PythosXGraphqlRepo,
  type PythosXReport,
  type RepoCandidateLists,
} from "../pythosx";

const repo = (name: string, stars: number, updatedAt: string, extra: Partial<PythosXGraphqlRepo> = {}): PythosXGraphqlRepo => ({
  name,
  nameWithOwner: `dev/${name}`,
  stargazerCount: stars,
  updatedAt,
  ...extra,
});

const lists = (overrides: Partial<RepoCandidateLists> = {}): RepoCandidateLists => ({
  recent: [], recentForks: [], starred: [], starredForks: [], ...overrides,
});

describe("selectRepositories", () => {
  it("picks 3 latest (by updatedAt) and 2 most starred (account-wide)", () => {
    const result = selectRepositories(lists({
      recent: [repo("a", 1, "2026-03-01T00:00:00Z"), repo("c", 0, "2026-01-01T00:00:00Z"), repo("b", 2, "2026-02-01T00:00:00Z"), repo("d", 0, "2025-01-01T00:00:00Z")],
      starred: [repo("old-hit", 900, "2020-01-01T00:00:00Z"), repo("mid-hit", 300, "2021-01-01T00:00:00Z"), repo("x", 5, "2022-01-01T00:00:00Z")],
    }));
    expect(result.selected.map((s) => s.repo.name)).toEqual(["a", "b", "c", "old-hit", "mid-hit"]);
    expect(result.selected[0]!.labels).toEqual(["Latest Repository 01"]);
    expect(result.selected[3]!.labels).toEqual(["Most Starred Repository 01"]);
    expect(result.overlapCount).toBe(0);
  });

  it("shows an overlapping repository once with both categories", () => {
    const hit = repo("hit", 500, "2026-04-01T00:00:00Z");
    const result = selectRepositories(lists({
      recent: [hit, repo("b", 0, "2026-03-01T00:00:00Z"), repo("c", 0, "2026-02-01T00:00:00Z")],
      starred: [hit, repo("second", 100, "2019-01-01T00:00:00Z")],
    }));
    expect(result.selected).toHaveLength(4);
    const merged = result.selected.find((s) => s.repo.name === "hit")!;
    expect(merged.categories).toEqual(["recent", "starred"]);
    expect(merged.labels).toEqual(["Latest Repository 01", "Most Starred Repository 01"]);
    expect(result.overlapCount).toBe(1);
  });

  it("de-duplicates repeated entries inside one list and ignores case", () => {
    const result = selectRepositories(lists({
      recent: [repo("A", 1, "2026-03-01T00:00:00Z"), { ...repo("a", 1, "2026-03-01T00:00:00Z"), nameWithOwner: "DEV/A" }],
    }));
    expect(result.selected).toHaveLength(1);
  });

  it("prefers originals; forks only fill remaining slots", () => {
    const result = selectRepositories(lists({
      recent: [repo("orig", 0, "2026-01-01T00:00:00Z")],
      recentForks: [repo("fresh-fork", 0, "2026-05-01T00:00:00Z", { isFork: true }), repo("fork2", 0, "2026-04-01T00:00:00Z", { isFork: true }), repo("fork3", 0, "2026-03-01T00:00:00Z", { isFork: true })],
    }));
    expect(result.selected.map((s) => s.repo.name)).toEqual(["orig", "fresh-fork", "fork2"]);
  });

  it("never ranks zero-star repositories as 'most starred'", () => {
    const result = selectRepositories(lists({ starred: [repo("zero", 0, "2026-01-01T00:00:00Z")] }));
    expect(result.starredCount).toBe(0);
    expect(result.selected).toHaveLength(0);
  });

  it("handles users with no repositories and with fewer than five", () => {
    expect(selectRepositories(lists()).selected).toEqual([]);
    const few = selectRepositories(lists({ recent: [repo("only", 3, "2026-01-01T00:00:00Z")], starred: [repo("only", 3, "2026-01-01T00:00:00Z")] }));
    expect(few.selected).toHaveLength(1);
    expect(few.selected[0]!.categories).toEqual(["recent", "starred"]);
  });
});

describe("analyzeTree", () => {
  it("detects tests, CI and licence from real tree paths and ignores vendored dirs", () => {
    const tree = [
      { path: "README.md", type: "blob" }, { path: "LICENSE", type: "blob" },
      { path: "src/app.ts", type: "blob" }, { path: "src/app.test.ts", type: "blob" },
      { path: ".github/workflows/ci.yml", type: "blob" },
      { path: "node_modules/x/index.test.js", type: "blob" },
    ];
    const signals = analyzeTree(tree);
    expect(signals.treeAvailable).toBe(true);
    expect(signals.testFileCount).toBe(1);
    expect(signals.hasWorkflows).toBe(true);
    expect(signals.hasLicenseFile).toBe(true);
    expect(signals.readmePath).toBe("README.md");
  });

  it("reports an unavailable tree instead of guessing", () => {
    expect(analyzeTree([]).treeAvailable).toBe(false);
  });
});

describe("analyzeReadme", () => {
  it("returns unknown (not 'missing') when the tree could not be read", () => {
    const readme = analyzeReadme(null, false, "seed");
    expect(readme.exists).toBeNull();
  });

  it("marks a missing README when the tree was readable", () => {
    expect(analyzeReadme(null, true, "seed").exists).toBe(false);
  });

  it("rewards setup and usage sections", () => {
    const good = analyzeReadme("# Tool\n\nA useful tool for people.\n\n## Installation\nnpm i\n\n## Usage\nrun it\n\n## License\nMIT\n" + "word ".repeat(120), true, "seed");
    const bad = analyzeReadme("# Tool", true, "seed");
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.missingSections).not.toContain("Installation / setup");
  });
});

describe("buildGhostReport", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");
  it("flags long-idle repositories and keeps fresh ones active", () => {
    expect(buildGhostReport(repo("old", 0, "2020-01-01T00:00:00Z", { pushedAt: "2020-01-01T00:00:00Z" }), now, "s").activityLevel).toMatch(/Dormant|Ghost/);
    expect(buildGhostReport(repo("new", 0, "2026-05-30T00:00:00Z", { pushedAt: "2026-05-30T00:00:00Z" }), now, "s").activityLevel).toBe("Active");
  });
});

describe("mergeAIReview", () => {
  const baseReport = (): PythosXReport => ({
    version: 1,
    generatedAt: "2026-06-01T00:00:00Z",
    aiEnhanced: false,
    professionalReview: { verdict: { impression: "deterministic impression" } } as any,
    repositoryIntelligence: {
      status: "ok", message: null,
      repositories: [{ name: "Alpha", verdict: "det verdict", roasts: { friendly: ["f"], spicy: ["s"], brutal: ["b"] } } as any],
      selection: { recentCount: 1, starredCount: 0, overlapCount: 0, note: "" },
    },
    profileRoasts: { friendly: [], spicy: [], brutal: [] },
    funnyVerdict: { friendly: "f", spicy: "s", brutal: "b" },
  });

  it("ignores malformed AI output and keeps deterministic content", () => {
    const report = mergeAIReview(baseReport(), { professional_summary: 42, repos: "nope", funny_verdict: [] } as any);
    expect(report.aiEnhanced).toBe(false);
    expect(report.professionalReview.verdict.impression).toBe("deterministic impression");
  });

  it("applies valid AI wording only to repositories that exist", () => {
    const report = mergeAIReview(baseReport(), {
      professional_summary: "A grounded summary of the public profile.",
      repos: [
        { name: "alpha", technical_verdict: "AI verdict that is long enough to count.", roast_spicy: "Spicy AI line about the repo." },
        { name: "ghost-repo", technical_verdict: "Should be ignored entirely." },
      ],
    });
    expect(report.aiEnhanced).toBe(true);
    expect(report.repositoryIntelligence.repositories).toHaveLength(1);
    expect(report.repositoryIntelligence.repositories[0]!.verdict).toContain("AI verdict");
    expect(report.repositoryIntelligence.repositories[0]!.roasts.spicy[0]).toContain("Spicy AI line");
  });
});

describe("buildFunnyVerdict", () => {
  it("does not roast an empty account", () => {
    expect(buildFunnyVerdict([], "nobody").friendly).toMatch(/nothing to roast/i);
  });
});
