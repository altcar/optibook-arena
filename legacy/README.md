# Legacy strategy archive

These files are copied **unchanged** from the original
[`altcar/htb-optiver-challenge`](https://github.com/altcar/htb-optiver-challenge)
repository so the strategy logic can be compared with the TypeScript ports in
[`src/worker/strategies.ts`](../src/worker/strategies.ts).

They are **reference material only**. Nothing in this folder is built or run by
Optibook Arena.

## Why archive them?

The original strategies depend on `optibook.synchronous_client.Exchange` and a
hosted Optibook venue that was retired after the hackathon. Porting them to a
self-contained Cloudflare Worker keeps the ideas, not the dead connector.

## Mapping to the running engines

| Arena engine | Original source | What was kept |
| --- | --- | --- |
| **Dual Maker** (`dual-mm`) | `pregame/arbStrat1`, `pregame/arbStrat2`, `endgame/final_solution` | Quote the stock around the dual mid, inventory skew, cancel/replace on drift |
| **Pair Hedger** (`hedge`) | `pregame/arbStrat2/hedge_strategy.py`, `endgame/final_solution/controller.py` | Net-delta band and IOC flattening |
| **Dual Arbitrage** (`dual-arb`) | `endgame/strat_worky/main.py`, `endgame/arbStrat4/hedge_arbitrage.py` | Buy cheap leg / sell rich leg when the basis clears the edge |
| **News Sentiment** (`sentiment-mm`) | `endgame/arbStrat2sentiment`, `endgame/arbStrat3` | Headline scoring, fair-value shift, directional reaction trades |
| **Momentum Maker** (`momentum-mm`) | `endgame/hugoarbones/momentum.py` | Short-horizon momentum bias, volatility-scaled spread and size |
| **Adaptive Maker** (`adaptive-mm`) | `endgame/final_solution/controller.py` | `tanh` inventory skew, market-aware spread, threshold hedging |

## Folder guide

- `pregame/arbStrat1` — dual-priced market making with no hedging.
- `pregame/arbStrat2` — dual market making + portfolio hedge.
- `endgame/arbStrat2sentiment` — earlier sentiment model integration.
- `endgame/arbStrat3` — news/edge controller and the raw Optibook WebSocket
  client (LZ4-framed MessagePack), useful for understanding the original feed.
- `endgame/arbStrat4` — dual market making plus arbitrage.
- `endgame/final_solution` — the team's final adaptive controller.
- `endgame/strat_worky` — standalone dual-arbitrage loop.
- `endgame/hugoarbones/momentum.py` — momentum market maker.
- `tools/` — original WebSocket client, scraper, news handler, and template.
- `strat.txt`, `HTB optiver notes.txt` — original scratch notes.

## Attribution

All code in this folder belongs to the original repository authors. It is
included with attribution for study and comparison. The new Optibook Arena code
is MIT licensed; this legacy folder is **not** relicensed.
