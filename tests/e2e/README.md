# Dispatch flow e2e (@dispatch)

Run the suite headless:

```bash
export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"
corepack pnpm exec playwright test --grep @dispatch
```

No manual startup is needed. `playwright.config.ts` boots both servers:

- **API** on `http://127.0.0.1:8180` with `DEMO_MODE=true CALL_BACKEND=mock`.
  Demo mode bypasses auth with a fixed demo org, keeps cases in an in-memory
  store, and evaluates the compliance policy engine with a pinned clock
  (2026-07-01 19:00 UTC) so quiet-hours checks never flake on wall time.
- **Web** on `http://127.0.0.1:3180` with `NEXT_PUBLIC_DEMO_MODE=true` and
  its `/api/*` rewrites (plus server-side case reads via `BACKEND_URL`)
  pointed at the test API.

The mock call backend is fully deterministic:

- first status poll reports `in_progress`, every later poll is terminal;
- the last digit of the dialed number scripts the outcome:
  `...2` voicemail, `...3` no answer, `...4` error, anything else completed;
- artifacts are canned (silent WAV data URI, synthesized transcript,
  must-ask answers, `$0.42` / `184s` for completed calls).

Specs (all titles carry the `@dispatch` tag):

| Spec | Covers |
| --- | --- |
| `plan-review.spec.ts` | Gate 1 renders the verbatim disclosure line and OFF-by-default pre-auth checkboxes |
| `two-gate.spec.ts` | Approve and dispatch stays disabled until the preflight allows |
| `dispatch-complete.spec.ts` | approve -> dispatch -> completed -> artifacts (audio, transcript, outcome, cost/duration) |
| `policy-deny.spec.ts` | Policy deny renders human-readable reasons |
| `attach-case.spec.ts` | Case-linked dispatch auto-attaches; case timeline shows the call with a link back |
| `redial-retry.spec.ts` | Retry trips the 24h redial guard and offers the SMS channel switch |

Tests run in parallel against one shared API process; every spec dials a
distinct phone number so the per-number redial guard never cross-talks.

If the cached Chromium build mismatches, run:

```bash
corepack pnpm exec playwright install chromium
```
