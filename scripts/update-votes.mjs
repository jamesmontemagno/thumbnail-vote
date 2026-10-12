import { readFile, writeFile } from "node:fs/promises";
import { fetchGitHubVotes } from "../vote-data.mjs";

const config = JSON.parse(await readFile(new URL("../thumbnails.json", import.meta.url), "utf8"));
const snapshot = await fetchGitHubVotes(config, { token: process.env.GITHUB_TOKEN });
await writeFile(new URL("../votes.json", import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Updated ${snapshot.counts.length} thumbnail vote totals at ${snapshot.updatedAt}.`);
