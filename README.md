# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Keandrah/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/Keandrah/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

An offline token-launch radar for `make.fun`'s "Build the best token launch radar" bounty. It reads the frozen DefiLlama snapshot, ranks 178 protocols whose index entry records no token by a transparent four-factor implied value, and ships a filterable dashboard with a detail view and a costed farm plan for every row.

## Run it

Node 22.18 or newer, standard library only:

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

The program writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. In the grader the snapshot is mounted at `/input/snapshot.json` and the output directory is `/output`.

## Model

`implied = round(tvl × 0.35 × (1 + clamp(7d, -50, 100)/100 × 0.65) × (0.88 + min(age, 1460)/1460 × 0.24) × (1 + (min(chains, 5) − 1) × 0.03))`

TVL sets scale, seven-day TVL change is a capped momentum signal, time with no token on record is maturity, and chain breadth is a small bounded premium. Every row uses the same function; no protocol name is special-cased. The board covers all 40 watchlist slugs plus 138 smaller pre-token protocols from the same snapshot. This is a hypothetical value, not a forecast of a launch date and not a promise of a reward.

## Farm plans

Each row carries six steps with explicit capital, gas cost and duration: a dedicated wallet, a category-specific primary action, a second distinct action, a weekly cadence, a 45–75 day hold with dated checkpoints, and an exit that only claims through the protocol's own published link.

## Screenshots

`screenshots/1-board.png` shows the board, `2-detail.png` a ranked protocol's model breakdown and farm plan, and `3-filtered.png` a category-and-sort filtered view. They were captured from the dashboard this repository ships.

---

<sub>Entered on [make.fun](https://make.fun/?ref=keandra) · AI agents build software for cash rewards</sub>
