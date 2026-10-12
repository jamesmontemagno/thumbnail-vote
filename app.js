import { fetchGitHubVotes, summarizeVotes, validateConfig, validateSnapshot } from "./vote-data.mjs";

const grid = document.querySelector("#thumbnails");
const status = document.querySelector("#vote-status");
const error = document.querySelector("#vote-error");
const refreshButton = document.querySelector("#refresh-votes");
const total = document.querySelector("#total-votes");
const cardCounts = new Map();
const cardLeaders = new Map();
let config;
let hasResults = false;

async function loadJSON(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  return response.json();
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function link(label, href, className) {
  const node = element("a", className, label);
  node.href = href;
  return node;
}

function renderCards() {
  for (const [index, thumbnail] of config.thumbnails.entries()) {
    const card = element("article", "card");
    const headingID = `thumbnail-${thumbnail.issue}`;
    card.setAttribute("aria-labelledby", headingID);
    const imageLink = link(undefined, `${thumbnail.slug}-1920.png`, "image-link");
    imageLink.target = "_blank";
    imageLink.rel = "noopener noreferrer";
    imageLink.setAttribute("aria-label", `Open ${thumbnail.title} at full size`);
    const image = element("img", "thumbnail");
    image.src = `${thumbnail.slug}.jpg`;
    image.alt = thumbnail.alt;
    image.width = 1280;
    image.height = 720;
    image.loading = index < 2 ? "eager" : "lazy";
    image.decoding = "async";
    imageLink.append(image);
    const content = element("div", "card-content");
    const heading = element("div", "card-heading");
    const titleGroup = element("div");
    titleGroup.append(element("span", "card-number", `DESIGN ${String(index + 1).padStart(2, "0")}`));
    const title = element("h2", undefined, thumbnail.title);
    title.id = headingID;
    titleGroup.append(title);
    const count = element("span", "vote-count", "— votes");
    cardCounts.set(thumbnail.issue, count);
    heading.append(titleGroup, count);
    const description = element("p", "card-description", thumbnail.description);
    const actions = element("div", "links");
    const voteLink = link("Vote on GitHub ↗", `https://github.com/${config.repository}/issues/${thumbnail.issue}`, "button primary vote-link");
    voteLink.target = "_blank";
    voteLink.rel = "noopener noreferrer";
    voteLink.setAttribute("aria-label", `Vote for ${thumbnail.title} on GitHub`);
    actions.append(voteLink);
    for (const [label, path] of [["JPG", `${thumbnail.slug}.jpg`], ["PNG", `${thumbnail.slug}-1920.png`]]) {
      const download = link(label, path, "download-link");
      download.download = "";
      download.setAttribute("aria-label", `Download ${thumbnail.title} as ${label}`);
      actions.append(download);
    }
    const leader = element("span", "leader");
    leader.hidden = true;
    cardLeaders.set(thumbnail.issue, leader);
    content.append(heading, description, actions, leader);
    card.append(imageLink, content);
    grid.append(card);
  }
}

function showResults(snapshot, live) {
  validateSnapshot(snapshot, config);
  const { total: votes, leaders } = summarizeVotes(snapshot);
  total.textContent = `${votes.toLocaleString()} ${votes === 1 ? "vote" : "votes"} across ${config.thumbnails.length} designs`;
  for (const record of snapshot.counts) {
    cardCounts.get(record.issue).textContent = `👍 ${record.votes.toLocaleString()}`;
    cardCounts.get(record.issue).setAttribute("aria-label", `${record.votes} thumbs-up votes`);
    const leader = cardLeaders.get(record.issue);
    leader.hidden = !leaders.includes(record.issue);
    leader.textContent = leaders.length > 1 ? "Tied for the lead" : "Currently leading";
  }
  const time = new Date(snapshot.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  status.textContent = `${live ? "Checked GitHub" : "Published results"} · ${time}`;
  hasResults = true;
}

async function refreshVotes() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Checking GitHub…";
  error.hidden = true;
  try {
    showResults(await fetchGitHubVotes(config), true);
  } catch (failure) {
    console.error("Vote refresh failed:", failure);
    error.textContent = `${failure.message} ${hasResults
      ? "The last successfully loaded results are still displayed."
      : "Vote totals are unavailable. You can still vote using the GitHub links."}`;
    error.hidden = false;
    if (!hasResults) {
      total.textContent = "Vote totals unavailable";
      status.textContent = "Voting on GitHub is still available.";
    }
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh votes";
  }
}

document.querySelector("#feed-toggle").addEventListener("click", event => {
  const enabled = grid.classList.toggle("feed-mode");
  event.currentTarget.setAttribute("aria-pressed", String(enabled));
  event.currentTarget.textContent = enabled ? "Full-size preview" : "Small-feed preview";
});
refreshButton.addEventListener("click", refreshVotes);

try {
  config = validateConfig(await loadJSON("./thumbnails.json"));
  renderCards();
  try {
    showResults(await loadJSON("./votes.json"), false);
  } catch (failure) {
    console.error("Published vote snapshot could not be loaded:", failure);
    status.textContent = "Published results unavailable; checking GitHub.";
  }
  await refreshVotes();
} catch (failure) {
  console.error("Thumbnail gallery failed to load:", failure);
  total.textContent = "The gallery could not be loaded";
  status.textContent = "Please try reloading the page.";
  error.textContent = `${failure.message} You can compare designs using the side-by-side image and vote in the repository's issues.`;
  error.hidden = false;
}
