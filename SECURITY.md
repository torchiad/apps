# Security policy

This repo is a shelf of small, static, client-only apps (no backend, no user
accounts, no server-side secrets). The realistic risk surface is: a
dependency vulnerability, XSS-style issues in an app's own JS, or a secret
accidentally committed — not data breach of a live service.

## Reporting a vulnerability

Please use GitHub's ["Report a vulnerability"](../../security/advisories/new)
flow (Security tab → Advisories) rather than a public issue, so a fix can
land before details are public. If that's unavailable to you, open an issue
with as little sensitive detail as possible and note that it's a security
report.

## What's automated here

- **Dependabot** (`.github/dependabot.yml`) opens PRs for vulnerable or
  outdated dependencies (npm) and GitHub Actions, weekly.
- **Gitleaks** (`.github/workflows/gitleaks.yml`) scans every PR's diff for
  committed secrets/credentials.
- **Automated code + security review** (`.github/workflows/claude-review.yml`)
  checks every PR for OWASP-Top-10-style issues before it can merge.
- Third-party GitHub Actions used in this repo's workflows are pinned to a
  commit SHA, not a mutable tag.

See `AGENTS.md` for the full set of required checks.
