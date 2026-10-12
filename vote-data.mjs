export function validateConfig(config) {
  if (!config || typeof config.repository !== "string" ||
      !/^[\w.-]+\/[\w.-]+$/.test(config.repository) ||
      !Array.isArray(config.thumbnails) || config.thumbnails.length === 0) {
    throw new Error("Invalid thumbnail configuration.");
  }
  const issues = new Set();
  const slugs = new Set();
  for (const thumbnail of config.thumbnails) {
    if (!Number.isSafeInteger(thumbnail.issue) || thumbnail.issue < 1 ||
        issues.has(thumbnail.issue) ||
        typeof thumbnail.slug !== "string" || !/^[a-z0-9-]+$/.test(thumbnail.slug) ||
        slugs.has(thumbnail.slug) ||
        ![thumbnail.title, thumbnail.description, thumbnail.alt].every(
          value => typeof value === "string" && value.trim().length > 0,
        )) {
      throw new Error("Invalid or duplicate thumbnail.");
    }
    issues.add(thumbnail.issue);
    slugs.add(thumbnail.slug);
  }
  return config;
}

export function validateSnapshot(snapshot, config) {
  validateConfig(config);
  if (!snapshot || !Number.isFinite(Date.parse(snapshot.updatedAt)) ||
      !Array.isArray(snapshot.counts)) {
    throw new Error("Invalid vote snapshot.");
  }
  const counts = new Map();
  for (const record of snapshot.counts) {
    if (!Number.isSafeInteger(record.issue) || counts.has(record.issue) ||
        !Number.isSafeInteger(record.votes) || record.votes < 0) {
      throw new Error("Invalid vote count.");
    }
    counts.set(record.issue, record.votes);
  }
  if (counts.size !== config.thumbnails.length ||
      config.thumbnails.some(thumbnail => !counts.has(thumbnail.issue))) {
    throw new Error("Vote snapshot does not match the thumbnail configuration.");
  }
  return snapshot;
}

export function countIssueVotes(issues, config, updatedAt = new Date().toISOString()) {
  validateConfig(config);
  if (!Array.isArray(issues)) {
    throw new Error("GitHub returned an invalid issue list.");
  }
  const byNumber = new Map(issues.filter(issue => !issue.pull_request).map(issue => [issue.number, issue]));
  const counts = config.thumbnails.map(thumbnail => {
    const issue = byNumber.get(thumbnail.issue);
    if (!issue || typeof issue.reactions !== "object" || issue.reactions === null) {
      throw new Error(`Voting issue #${thumbnail.issue} is missing. Check its thumbnail-vote label.`);
    }
    return { issue: thumbnail.issue, votes: issue.reactions["+1"] };
  });
  return validateSnapshot({ updatedAt, counts }, config);
}

export async function fetchGitHubVotes(config, { token, fetchImpl = fetch } = {}) {
  validateConfig(config);
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const issues = [];
  let url = `https://api.github.com/repos/${config.repository}/issues?state=all&labels=thumbnail-vote&per_page=100`;
  while (url) {
    const response = await fetchImpl(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        throw new Error("GitHub's API limit was reached. Try refreshing votes later.");
      }
      throw new Error(`GitHub vote lookup failed (HTTP ${response.status}).`);
    }
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("GitHub returned an invalid issue list.");
    issues.push(...page);
    if (config.thumbnails.every(thumbnail => issues.some(
      issue => issue.number === thumbnail.issue && !issue.pull_request,
    ))) break;
    const next = response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    if (next) {
      const nextURL = new URL(next);
      if (nextURL.origin !== "https://api.github.com" ||
          nextURL.pathname !== `/repos/${config.repository}/issues`) {
        throw new Error("GitHub returned an unexpected pagination URL.");
      }
    }
    url = next;
  }
  return countIssueVotes(issues, config);
}

export function summarizeVotes(snapshot) {
  const total = snapshot.counts.reduce((sum, record) => sum + record.votes, 0);
  const highest = Math.max(...snapshot.counts.map(record => record.votes));
  const leaders = highest > 0
    ? snapshot.counts.filter(record => record.votes === highest).map(record => record.issue)
    : [];
  return { total, leaders };
}
