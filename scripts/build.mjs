import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { validateConfig, validateSnapshot } from "../vote-data.mjs";

const root = new URL("../", import.meta.url);
const destination = new URL("../dist/", import.meta.url);
const config = validateConfig(JSON.parse(await readFile(new URL("thumbnails.json", root), "utf8")));
validateSnapshot(JSON.parse(await readFile(new URL("votes.json", root), "utf8")), config);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const files = ["index.html", "styles.css", "app.js", "vote-data.mjs", "thumbnails.json", "votes.json", "comparison.jpg"];
for (const thumbnail of config.thumbnails) {
  files.push(`${thumbnail.slug}.jpg`, `${thumbnail.slug}-1920.png`, `${thumbnail.slug}-small.jpg`);
}
for (const file of files) {
  await cp(new URL(file, root), new URL(file, destination));
}
await writeFile(new URL(".nojekyll", destination), "");
console.log(`Built static site in dist/ with ${files.length} public files.`);
