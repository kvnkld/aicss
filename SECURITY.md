# Security Policy

## Reporting a vulnerability

Please report security issues privately to **security@aicss.dev**.
Do not open a public issue for anything that could expose user data, secrets,
or allow access to Pro component code.

We aim to acknowledge reports within 3 business days.

## Scope we care about most

- **Entitlement bypass** - any way to obtain Pro component code without a
  valid license (e.g. via the `/r/[slug]` registry routes, API tokens, or the
  client bundle).
- **API token leakage** - tokens are per-user secrets stored on the `User`
  model and accepted via `Authorization: Bearer <token>`.
- **Auth / session issues** - magic-link auth (Auth.js) and Stripe webhook
  signature verification.

## Secrets

- Never commit real secrets. `.env*` is gitignored.
- If a key is ever exposed (Stripe, Auth secret, SMTP), **rotate it
  immediately** in the corresponding dashboard.
- CI uses placeholder env values only.
