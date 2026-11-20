# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mirh24/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mirh24/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar — prices every pre-token protocol off a log–log power-law fitted on 119 traded tokens, with slice-based farm plans at a $1,000 plan size.

## The model (radar-5)

Implied value = 10^3.38 × TVL^0.472 × family factor × growth multiplier.

- **Size curve:** log market cap = 7.7881 + 0.4721 × log TVL, least squares on the 119 live tokens in the snapshot. The slope is stable: 200 bootstrap resamples put it between 0.30 and 0.64.
- **Family factor:** each category's traded tokens' mean residual against the curve, shrunk toward 1 by n/(n+40). A category with no traded tokens gets a factor of 1, so no row ever rests on a fallback.
- **Growth:** the 7-day TVL change, clamped to −60%…+120% and weighted by 0.5.
- **Age and chain count do not move the value.** They are shown on every row, but leave-one-out testing shows the old chains multiplier made predictions worse and the old 0.60–1.00 maturity swing added nothing, so radar-5 drops both. No protocol name is ever special-cased.

## Tested, not asserted

Leave-one-out over the 119 live tokens, testing the exact function that scores the board:

| Backtest | Median error | Within 2× | Within 3× |
|---|---:|---:|---:|
| **radar-5, full pipeline** | **×3.17** | **34%** | **45%** |
| Curve + family only | ×3.36 | 33% | 46% |
| Flat multiple | ×5.02 | 22% | 33% |

The same pipeline on a fresh DefiLlama fetch (20 Nov 2026, 111 live tokens) misses by ×3.27, so the gain is not fitted to one snapshot. Every row carries a band of ÷3.17 to ×3.17, and every farm plan is netted to the dollar at $1,000: **134 FARM, 56 THIN, 8 SKIP**.

## What changed from radar-4

Radar-4 backtested the curve and the family factor only (×3.36) and never tested the multipliers it shipped. Radar-5 tests the exact function that scores the board, and two multipliers failed that test: the chains multiplier (full pipeline ×3.31 with it, ×3.15 without it) and the maturity swing (removing it leaves the median error unchanged). The dashboard's methodology panel states the ablation with the numbers. The board also gains a "Best farms" strip — the five FARM rows that pay the most per hour, net of gas and the treasury-bill alternative.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=cxfwn5nb&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
