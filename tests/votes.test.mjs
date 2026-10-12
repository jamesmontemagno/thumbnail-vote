import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { countIssueVotes, fetchGitHubVotes, summarizeVotes, validateConfig, validateSnapshot } from "../vote-data.mjs";

const config = JSON.parse(await readFile(new URL("../thumbnails.json", import.meta.url), "utf8"));
const now = "2026-10-12T04:00:00.000Z";
const issues = config.thumbnails.map((thumbnail, index) => ({
  number: thumbnail.issue,
  state: index === 0 ? "closed" : "open",
  reactions: { "+1": index, "-1": 7, heart: 100, total_count: index + 107 },
}));

const n = config.thumbnails.length;
const expectedTotal = (n * (n - 1)) / 2;

test("counts only thumbs-up on configured issues, including closed issues", () => {
  const snapshot = countIssueVotes([...issues, { number: 99, reactions: { "+1": 500 } }], config, now);
  assert.deepEqual(snapshot.counts.map(record => record.votes), [...Array(n).keys()]);
  assert.equal(snapshot.updatedAt, now);
  assert.equal(summarizeVotes(snapshot).total, expectedTotal);
  assert.deepEqual(summarizeVotes(snapshot).leaders, [config.thumbnails.at(-1).issue]);
});

test("missing issues, missing counts, negative and nonnumeric votes fail explicitly", () => {
  assert.throws(() => countIssueVotes(issues.slice(1), config), /missing/);
  for (const votes of [undefined, -1, 1.5, "4", null, NaN]) {
    const invalid = issues.map(issue => ({ ...issue, reactions: { ...issue.reactions } }));
    invalid[0].reactions["+1"] = votes;
    assert.throws(() => countIssueVotes(invalid, config), /Invalid vote count/);
  }
});

test("a pull request cannot masquerade as a voting issue", () => {
  const invalid = issues.map(issue => ({ ...issue }));
  invalid[0].pull_request = { url: "https://example.com" };
  assert.throws(() => countIssueVotes(invalid, config), /missing/);
});

test("zero votes produce no leader and a tie identifies every leader", () => {
  const snapshot = countIssueVotes(issues.map(issue => ({ ...issue, reactions: { "+1": 0 } })), config, now);
  assert.deepEqual(summarizeVotes(snapshot), { total: 0, leaders: [] });
  snapshot.counts[0].votes = 3;
  snapshot.counts[2].votes = 3;
  assert.deepEqual(summarizeVotes(snapshot), { total: 6, leaders: [1, 3] });
});

test("withdrawing a thumbs-up reduces the total", () => {
  const before = countIssueVotes(issues, config, now);
  const after = countIssueVotes(issues.map(issue => ({
    ...issue, reactions: { "+1": Math.max(0, issue.reactions["+1"] - 1) },
  })), config, now);
  assert.equal(summarizeVotes(before).total - summarizeVotes(after).total, n - 1);
});

test("configuration rejects duplicate issues, unsafe slugs, and empty descriptions", () => {
  assert.equal(validateConfig(config), config);
  for (const change of [
    { issue: 2 },
    { slug: "../private" },
    { description: "" },
  ]) {
    const invalid = structuredClone(config);
    Object.assign(invalid.thumbnails[0], change);
    assert.throws(() => validateConfig(invalid), /Invalid/);
  }
});

test("snapshots reject duplicate or missing entries and invalid dates", () => {
  const snapshot = countIssueVotes(issues, config, now);
  assert.throws(() => validateSnapshot({ ...snapshot, updatedAt: "bad" }, config), /Invalid/);
  assert.throws(() => validateSnapshot({ ...snapshot, counts: snapshot.counts.slice(1) }, config), /does not match/);
  assert.throws(() => validateSnapshot({ ...snapshot, counts: [...snapshot.counts, snapshot.counts[0]] }, config), /Invalid/);
});

test("GitHub API requests use labeled issues and public browsing does not send a token", async () => {
  const snapshot = await fetchGitHubVotes(config, {
    fetchImpl: async (url, options) => {
      assert.match(url, /labels=thumbnail-vote/);
      assert.match(url, /state=all/);
      assert.equal(options.headers.Authorization, undefined);
      return new Response(JSON.stringify(issues));
    },
  });
  assert.equal(summarizeVotes(snapshot).total, expectedTotal);
});

test("pagination fetches later voting issues and authenticates workflow requests", async () => {
  let calls = 0;
  const snapshot = await fetchGitHubVotes(config, {
    token: "test-token",
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(options.headers.Authorization, "Bearer test-token");
      if (calls === 1) {
        return new Response(JSON.stringify(issues.slice(0, 2)), {
          headers: { link: `<https://api.github.com/repos/${config.repository}/issues?page=2>; rel="next"` },
        });
      }
      assert.match(url, /page=2/);
      return new Response(JSON.stringify(issues.slice(2)));
    },
  });
  assert.equal(calls, 2);
  assert.equal(summarizeVotes(snapshot).total, expectedTotal);
});

test("pagination cannot forward tokens to another origin", async () => {
  await assert.rejects(fetchGitHubVotes(config, {
    token: "test-token",
    fetchImpl: async () => new Response("[]", {
      headers: { link: '<https://example.com/steal>; rel="next"' },
    }),
  }), /unexpected pagination URL/);
});

test("rate limits and other HTTP errors remain errors, not zero votes", async () => {
  for (const status of [403, 429, 404, 500]) {
    await assert.rejects(fetchGitHubVotes(config, {
      fetchImpl: async () => new Response("{}", { status }),
    }), status === 403 || status === 429 ? /API limit/ : /lookup failed/);
  }
});

test("all published thumbnails exist and upload JPGs are under 2 MB", async () => {
  for (const thumbnail of config.thumbnails) {
    for (const suffix of [".jpg", "-1920.png", "-small.jpg"]) {
      const info = await stat(new URL(`../${thumbnail.slug}${suffix}`, import.meta.url));
      assert.ok(info.isFile());
      if (suffix === ".jpg") assert.ok(info.size < 2_000_000);
    }
  }
});
