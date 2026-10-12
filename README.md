# Thumbnail Vote

A public voting gallery for the **First Steps with GitHub Copilot app** YouTube workshop.

**Vote here:** https://jamesmontemagno.github.io/thumbnail-vote/

## Voting

Each thumbnail has a GitHub issue labeled `thumbnail-vote`. The gallery's **Vote on GitHub** button opens that issue. Add a **👍 reaction to the opening post**, not a comment, to vote. A GitHub account is required.

- One thumbs-up per account per design, enforced by GitHub.
- You can support multiple designs. Totals are approvals, not unique voters.
- Remove your reaction to withdraw a vote.
- Cards are shuffled on every page load so no design gets a placement advantage. Design numbers match issue numbers.
- Comments and other reaction types do not count.
- Feedback comments are welcome. They trigger a rebuild but are not votes.

The site checks GitHub's public API on page load and when **Refresh votes** is selected. It displays the last published snapshot if the API is unavailable, with an explicit warning. No tokens, voter identities, cookies, or analytics are stored by the site. GitHub handles sign-in and reactions.

## Automatic publishing

`.github/workflows/deploy.yml` reads current reactions and deploys the static site to GitHub Pages:

- After a push to `main`.
- Hourly, at minute 17 (UTC), subject to GitHub Actions scheduling delays.
- After issue label/state changes or comments on voting issues.
- Manually through **Actions → Refresh votes and deploy Pages → Run workflow**.

**GitHub Actions has no reaction-added/removed trigger.** Reaction changes are picked up by live browser refreshes and the hourly deployment; they do not trigger an immediate deployment on their own. Scheduled workflows may be disabled by GitHub after 60 days of repository inactivity. Re-enable the workflow in Actions if needed.

GitHub Pages must use **GitHub Actions** as its publishing source. The workflow needs no personal access token: its scoped `GITHUB_TOKEN` reads issues, and the deployment job uses Pages/OIDC permissions. It never writes votes or commits generated results. The refreshed `votes.json` is persisted in each Pages deployment artifact.

## Local development

Requires Node.js 22+; there are no npm dependencies to install.

```sh
npm test
npm run update-votes
npm run build
npm run serve
```

Open http://localhost:4173. `update-votes` uses the public API without authentication. If rate-limited, supply `GITHUB_TOKEN` through your environment, never a checked-in file.

## Updating the choices

`thumbnails.json` defines the repository, thumbnail slugs, descriptions, and issue numbers. Keep each configured issue labeled `thumbnail-vote`, including closed issues. The script fails explicitly if an issue or its vote count is missing; it never replaces a failed lookup with zero votes.

For each slug include:

- `<slug>.jpg`: upload-ready 1280 × 720 thumbnail.
- `<slug>-1920.png`: full-resolution 1920 × 1080 thumbnail.
- `<slug>-small.jpg`: small-feed preview.

Update `comparison.jpg` and the non-JavaScript fallback in `index.html` when changing choices. Run `npm run update-votes`, `npm test`, and `npm run build`, then push to `main`.

Only finished thumbnail assets and site source are published. Local video extracts and the machine-specific image generator are ignored.
