import { describe, it, expect, afterEach, vi } from "vitest";
import worker from "../worker";

const node = (name: string, stars: number, updatedAt: string, extra: Record<string, unknown> = {}) => ({
  name, nameWithOwner: `tester/${name}`, description: `${name} description`, url: `https://github.com/tester/${name}`,
  homepageUrl: null, stargazerCount: stars, forkCount: 0, diskUsage: 120, createdAt: "2022-01-01T00:00:00Z",
  updatedAt, pushedAt: updatedAt, isArchived: false, isFork: false, primaryLanguage: { name: "TypeScript" },
  defaultBranchRef: { name: "main" }, licenseInfo: { spdxId: "MIT", name: "MIT License" }, issues: { totalCount: 1 },
  languages: { edges: [{ size: 1000, node: { name: "TypeScript" } }] }, repositoryTopics: { nodes: [] }, ...extra,
});

const recent = [node("fresh", 1, "2026-05-01T00:00:00Z"), node("fresh2", 0, "2026-04-01T00:00:00Z"), node("hit", 99, "2026-03-01T00:00:00Z")];
const starred = [node("hit", 99, "2026-03-01T00:00:00Z"), node("legacy", 40, "2020-01-01T00:00:00Z")];

function installFetch(options: { failSelection?: boolean } = {}) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    calls.push(url);
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url === "https://api.github.com/graphql") {
      const { query } = JSON.parse(init.body);
      if (query.includes("PythosXSelection")) {
        if (options.failSelection) return json({ errors: [{ message: "boom" }] }, 502);
        return json({ data: { user: { recent: { nodes: recent }, recentForks: { nodes: [] }, starred: { nodes: starred }, starredForks: { nodes: [] } } } });
      }
      return json({ data: { user: {
        login: "tester", name: "Test Er", bio: "Builds things", websiteUrl: "https://example.dev", createdAt: "2019-01-01T00:00:00Z",
        pinnedItems: { totalCount: 2 }, organizations: { totalCount: 1 }, gists: { totalCount: 0 }, followers: { totalCount: 7 },
        publicRepos: { totalCount: 4 }, contributionsCollection: { totalCommitContributions: 50, totalPullRequestContributions: 5, restrictedContributionsCount: 0, contributionCalendar: { totalContributions: 80 } },
        repositories: { totalCount: 4, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [...recent, node("legacy", 40, "2020-01-01T00:00:00Z")] },
      } } });
    }
    if (url.includes("/git/trees/")) return json({ tree: [{ path: "README.md", type: "blob" }, { path: "src/index.ts", type: "blob" }] });
    if (url.startsWith("https://raw.githubusercontent.com/")) {
      if (url.endsWith("README.md")) return new Response("# Project\n\nSomething useful.\n\n## Installation\nnpm i\n", { status: 200 });
      return new Response("", { status: 404 });
    }
    return json({}, 404);
  }));
  return calls;
}

const analyze = async () => {
  const res = await worker.fetch(new Request("http://localhost/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "tester" }) }), { GITHUB_PAT: "x" } as any, {} as any);
  return { status: res.status, body: (await res.json()) as any };
};

afterEach(() => vi.unstubAllGlobals());

describe("/api/analyze → pythosx report", () => {
  it("returns the PythosX report with deduplicated latest + most-starred repositories", async () => {
    const calls = installFetch();
    const { status, body } = await analyze();
    expect(status).toBe(200);
    expect(body.pythosx.version).toBe(1);
    const names = body.pythosx.repositoryIntelligence.repositories.map((r: any) => r.name);
    expect(names).toEqual(["fresh", "fresh2", "hit", "legacy"]);
    const hit = body.pythosx.repositoryIntelligence.repositories.find((r: any) => r.name === "hit");
    expect(hit.categories).toEqual(["recent", "starred"]);
    expect(body.pythosx.repositoryIntelligence.selection.overlapCount).toBe(1);
    expect(body.pythosx.professionalReview.snapshot.username).toBe("tester");
    expect(body.pythosx.professionalReview.presenceScore.overall).toBeGreaterThan(0);
    expect(body.pythosx.aiEnhanced).toBe(false); // no Groq key configured
    expect(calls.filter((u) => u === "https://api.github.com/graphql").length).toBe(2);
  });

  it("falls back to the profile sample when the selection query fails, and still returns existing fields", async () => {
    installFetch({ failSelection: true });
    const { status, body } = await analyze();
    expect(status).toBe(200);
    expect(body.devIq).toBeDefined();
    expect(body.pythosx.repositoryIntelligence.repositories.length).toBeGreaterThan(0);
  });
});
