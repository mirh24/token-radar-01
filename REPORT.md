# token-radar-01 v5 — build report (20 Nov 2026)

Target: TOP 1. v4 stood at rank 197/14,018, judge 94.6321%; paid zone top 10, floor 96.0454% (rank 1: 96.6767%). Gap ~1.41pt.

## v5 vs v4 — verified numbers (same sealed snapshot, 119 live tokens)

| Metric | v4 | v5 | Change |
|---|---:|---:|---|
| LOO median error (full pipeline) | ×3.31 | **×3.17** | −4% |
| LOO median error (curve + family only) | ×3.36 | ×3.36 | same (ablation baseline kept) |
| Flat multiple | ×5.02 | ×5.02 | same |
| Within 2× | 31.9% | **34.5%** | +2.6pt |
| Within 3× | 46.2% | 44.5% | −1.7pt |
| Within 1.5× | 21.0% | 20.2% | −0.8pt |
| p80 log error | 2.50 | 2.51 | ~same |
| Farm verdicts ($1,000) | FARM 106 / THIN 73 / SKIP 19 | **FARM 134 / THIN 56 / SKIP 8** | +28 FARM |
| Fresh-data check (20 Nov DeFiLlama, 111 live tokens) | ×3.40 | **×3.27** | gain replicates |

The median error, within-2×, and the farm verdicts all improve on BOTH datasets. The within-3×/1.5× dip by ~1–2pt (1–2 tokens of 119) — reported honestly in the dashboard, not hidden.

## Exact improvements

1. **Chains multiplier REMOVED.** LOO: full pipeline ×3.31 with it, ×3.15 without it. A protocol on more chains is not worth more. Chains are still listed on every row and filterable; they just don't move the value.
2. **Maturity multiplier REMOVED.** LOO: removing the 0.60–1.00 swing from v4 leaves the median error unchanged (×3.31). Age is still shown on every row and drives the farm plan's holding window; it doesn't move the value. That is a tested choice, stated in the dashboard, not an omission.
3. **Backtest is now the FULL pipeline.** v4 backtested curve + family only and never tested the multipliers it shipped. v5 backtests the exact function that scores the board (curve + family + growth), and the value band every row carries is that full-pipeline median error (×3.17, was ×3.36). The curve-only backtest is kept beside it so the ablation is stated.
4. **"Best farms" strip.** The five FARM rows that pay the most per hour on $1,000 (Manifest Trade +$80.16/h, Monolith Market +$79.74/h, Theo Network tBill +$74.40/h, AlphaGrowth +$68.64/h, Turboflow Perps +$67.20/h), net of gas and the T-bill alternative. This fixes the v4 presentation weakness where the top rows showed SKIP with negative nets.
5. **Detail view + methodology updated** to match the new model (age/chains rows explain why they don't move the value; methodology states the ablation with numbers; README documents the model and the v4→v5 change).

Model: implied = 10^3.38 × TVL^0.472 × family factor × growth multiplier. Same curve (slope 0.4721, intercept 7.7881), same shrinkage k=40, same growth weight 0.5, same $50M floor, same 198 rows, same 40/40 watchlist coverage. Board top 5 reordered (Sentora Curator $73.1M now #1; Steakhouse Financial $71.5M #2) because maturity/chains no longer distort it.

## Verification

- **Determinism:** two runs of main.ts on the kit snapshot are byte-identical.
- **Gate check (local mirror):** ALL CHECKS PASS — dashboard 43,769 bytes (<64 KB), 198 rows, sorted, 40/40 watchlist, farm steps valid, 3 screenshots within size bounds, dossier 982,171 bytes byte-for-byte identical, page farm plans agree with board.json for all 198 rows, data.js agrees with board.json.
- **Screenshots regenerated and viewed:** board (1280×900), detail of Manifest Trade (1280×1440, shows the full breakdown + FARM plan), filtered Risk Curators (1280×900, 34 rows). One real bug caught by viewing them: the farms strip first used nested `r.farm_economics.*` but data.js rows are flat — it threw and blocked the whole page render. Fixed to flat fields; all three views now render.
- **Kit check:** `node cli/makefun.mjs check --repo repo5 --worktree --transcripts work5/bundle-v5.tar.gz` → **12 passed, 0 failed, 6 skipped, 5 checked at submission.** thinking_reproduces 45.0% (885/1966 lines, ≥30% required); lib/model.ts revised from 12 messages. The 5 "at submission" items are the site's (repo public on GitHub, owner.json committed + pushed, repo created after 2026-11-14, commit pushed, files differ from other entries).

## Xingchiapi — 3 calls, 0 succeeded

Key "Museng" (connector custom.xingchiapi) is valid: `/v1/models` returns STATUS OK, 1 model (gpt-6.1-sol). But generation is blocked for scripts:
- Call 1: POST /v1/chat/completions → HTTP 400 `chat_completions_disabled` (endpoint disabled; use /v1/responses).
- Call 2: POST /v1/responses (design review) → HTTP 403 `client_not_allowed` (only listed programming clients: Codex, Claude Code, OpenCode, ZCode, DeepSeek Harness, Hermes Agent, Cursor, etc.; scripts/direct SDK not supported).
- Call 3: POST /v1/responses (code review) → HTTP 403 `client_not_allowed` (same).

Did NOT spoof a User-Agent or impersonate a listed client. The key contributed NO review to v5; all analysis is my own, verified by the local LOO harness on the sealed snapshot + a fresh DeFiLlama fetch. Full log: `~/workspace/makefun-token-radar-01/work5/xingchi-call-log.md`. Follow-up: the key IS usable from a listed client (e.g. Codex CLI / Claude Code / Hermes Agent) — if mir runs one, it can power real generation work.

## Repo ready for upload

- Path: `~/workspace/makefun-token-radar-01/repo5/` — git commits `d49c4de` (the v5 build) + `3ea9c5e` (this report), author mirh24 <mirh3510@gmail.com>, same as v4.
- Files: README.md (3 make.fun badges), LICENSE (SPDX MIT), .makefun/owner.json (payout wallet 2RfewxFz6MqANGevFoLzcy72vXx6c61rdYWrcBuHsBGt), lib/model.ts, main.ts, dashboard/ (app.js 32,989 B, app.css, index.html), screenshots/ (3), vendor/makefun-board.ts. No .gitkeep files.
- Bundle (attempt): `~/workspace/makefun-token-radar-01/work5/bundle-v5.tar.gz` (1,088,672 B, sha256 fd4a8118ff41c0d52555f4ee9704032e8e134a384e2408bd7e36e8b196a7d339) — built from my v5 session + the v4 sessions (transcripts-v5.tar.gz, Nov 16). Kit check passes on it.

## What the parent still needs to do

1. **Upload repo5 to GitHub** (browser; no git credentials on this VM) and make it public. Note the kit's `repo_created_after_open` check: the repo must have been created on GitHub after 2026-11-14T10:00:00Z.
2. **Re-bundle from the top-level agent** before submitting: this bundle has 0 usage rows attached to my session (my token-usage row is written only when this subagent run completes). The bundle tool says to run it from the agent that started the subagent (agent_id 394ea5aa-0142-464b-8eaa-de2a07f59486), including that agent's session, then re-run the kit check. Also note: this kit (0.1.0+kit.9) does NOT accept `--mcp`, `--prompt-file`, `--prompt-origin`, or `--prompt-via` — those flags are from a newer kit version; the bundle here was built without them.
3. **Submit** (parent verification first). Deadline 14 Dec 2026.
