# What to upload — Optibook Arena bot spec v1

A bot is a **declarative JSON document**. It says which strategy family to run, which numeric
parameters to use, which instruments to trade, what risk limits apply, and — for custom bots — a
small rule set. The engine validates the file before it can trade and interprets it on every tick.

- Upload path: **Bot console → drop a `.json` file → Validate → Deploy** (`/bots`).
- API: `POST /api/bots` with the spec, or `POST /api/bots/validate` for a dry run.
- Template download: `GET /api/bots/template`.
- Maximum file size: **128 KB**. API request bodies are capped at 256 KB.
- Arbitrary Python or JavaScript is **not executed** in v1.

> **Simulation only.** Never upload secrets, API keys or personal data. The platform will never ask
> for brokerage credentials.

---

## 1. Top-level schema

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | 3–40 characters, unique within your account. |
| `description` | string | no | Up to 280 characters. |
| `family` | enum | yes | `dual-mm`, `hedge`, `dual-arb`, `sentiment-mm`, `momentum-mm`, `adaptive-mm`, `custom`. |
| `universe` | string[] | yes | 1–5 of `NVDA`, `CSCO`, `ING`, `SAN`, `PFE`. |
| `params` | object | no | Numeric strategy parameters. Unknown keys produce a warning. |
| `risk` | object | no | Defaults are applied when omitted; see §4. |
| `rules` | array | for `custom` | 1–12 rules; ignored for template families. |

Numbers must be finite. Strings are trimmed. Unknown top-level fields are ignored.

## 2. Families and parameters

| Family | Name | Parameters | Behaviour |
| --- | --- | --- | --- |
| `dual-mm` | Dual Maker | `spread`, `qty` | Quotes the stock around the blended stock/dual mid with inventory skew. |
| `hedge` | Pair Hedger | `threshold`, `qty` | Flattens the stock/dual pair when the combined delta leaves a band. |
| `dual-arb` | Dual Arbitrage | `edgeBps`, `qty` | Trades the basis when the stock/dual spread clears an edge in bps. |
| `sentiment-mm` | News Sentiment | `spread`, `qty`, `takeThreshold` | Leans or takes liquidity when the synthetic newswire score is strong. |
| `momentum-mm` | Momentum Maker | `spread`, `qty`, `horizon`, `bias`, `thresholdBps` | Uses short-horizon momentum and volatility-scaled spreads. |
| `adaptive-mm` | Adaptive Maker | `baseSpread`, `qty`, `hedgeThreshold` | Adapts spread to realised volatility and skews with tanh inventory. |
| `custom` | Custom Rules | `qty`, `edgeBps`, `cooldownMs` | Runs your declarative trigger/action rules against the venue. |

Sensible ranges:

- `qty`: 1–50 (larger orders are clipped to available room).
- `edgeBps`: 1–100.
- `spread`: 0.02–2.00 (dollars, not bps).
- `threshold` / `hedgeThreshold`: 2–100 shares.
- `horizon`: 2–60 ticks.
- `takeThreshold`: 0.05–1.0.
- `maxOrdersPerMin`: 1–120.

## 3. Minimal examples

### Dual arbitrage

```json
{
  "name": "Basis Hunter",
  "description": "Trade the basis when it clears 8 bps.",
  "family": "dual-arb",
  "universe": ["NVDA", "PFE"],
  "params": { "edgeBps": 8, "qty": 5 },
  "risk": { "maxPosition": 40, "maxGross": 60000, "maxOrdersPerMin": 20 }
}
```

### Dual maker

```json
{
  "name": "Dual Quoter",
  "family": "dual-mm",
  "universe": ["NVDA", "CSCO"],
  "params": { "spread": 0.14, "qty": 8 },
  "risk": { "maxPosition": 40, "maxGross": 60000, "maxOrdersPerMin": 20 }
}
```

### Pair hedger

```json
{
  "name": "Pair Flattener",
  "family": "hedge",
  "universe": ["NVDA", "ING"],
  "params": { "threshold": 30, "qty": 12 },
  "risk": { "maxPosition": 40, "maxGross": 60000, "maxOrdersPerMin": 10 }
}
```

### News sentiment

```json
{
  "name": "Headline Reactor",
  "family": "sentiment-mm",
  "universe": ["NVDA", "SAN", "PFE"],
  "params": { "spread": 0.16, "qty": 6, "takeThreshold": 0.4 },
  "risk": { "maxPosition": 40, "maxGross": 60000, "maxOrdersPerMin": 20 }
}
```

### Momentum

```json
{
  "name": "Momentum Probe",
  "family": "momentum-mm",
  "universe": ["CSCO", "ING"],
  "params": { "spread": 0.15, "qty": 6, "horizon": 6, "bias": 0.5, "thresholdBps": 1.5 },
  "risk": { "maxPosition": 40, "maxGross": 60000, "maxOrdersPerMin": 20 }
}
```

### Adaptive maker

```json
{
  "name": "Adaptive Maker",
  "family": "adaptive-mm",
  "universe": ["NVDA", "CSCO", "SAN"],
  "params": { "baseSpread": 0.07, "qty": 8, "hedgeThreshold": 70 },
  "risk": { "maxPosition": 40, "maxGross": 60000, "maxOrdersPerMin": 20 }
}
```

## 4. Risk limits

| Field | Range | Meaning |
| --- | --- | --- |
| `maxPosition` | 1–100 | Maximum absolute signed position per instrument for this bot's book. |
| `maxGross` | 1,000–1,000,000 | Maximum gross notional across the bot's book, checked before actions. |
| `maxOrdersPerMin` | 1–120 | Action-rate throttle; the runtime skips the bot once exhausted. |

Defaults: `maxPosition: 40`, `maxGross: 60000`, `maxOrdersPerMin: 20`.

The venue also enforces a **100-share net cap per instrument per account**, aggregated across manual
trading, enabled strategy families and all bots. You cannot exceed the venue cap by adding bots.

## 5. Custom rules

Each rule has a `when` array of 1–4 triggers and one `action`. All triggers must pass. A per-rule
cooldown prevents machine-gun submissions.

```json
{
  "when": [{ "field": "basisBps", "op": "gt", "value": 10, "instrument": "NVDA" }],
  "action": { "type": "pair", "long": "NVDA", "short": "NVDA_DUAL", "qty": 4 },
  "cooldownMs": 2000
}
```

### Trigger fields

| Field | Meaning |
| --- | --- |
| `basisBps` | Dual vs stock basis, already in basis points (`10` = 0.10%). |
| `changePct` | Last price vs previous close, in percent. |
| `sentiment` | Rolling news score for the instrument, roughly −1 to +1. |
| `momentumBps` | 8-tick price change in basis points. |
| `spreadBps` | Current synthetic bid/ask spread in basis points. |
| `inventory` | The bot book's signed position in the instrument. |
| `priceVsFairBps` | Mid vs the simulator fair value, in basis points. |

Operators: `gt`, `lt`, `abs_gt`. Add an optional `instrument` to evaluate a specific stock instead of
the current universe symbol. `abs_gt` compares absolute values.

### Actions

Order action:

```json
{
  "type": "order",
  "instrument": "NVDA",
  "side": "buy",
  "qty": 4,
  "orderType": "market",
  "offsetBps": 0
}
```

Pair action:

```json
{
  "type": "pair",
  "long": "NVDA",
  "short": "NVDA_DUAL",
  "qty": 4
}
```

- `qty`: 1–100.
- `orderType`: `market` (default), `ioc` or `limit`.
- `offsetBps`: 0–200. For a limit order, the engine prices away from the mid by this amount.
- Pair actions take both legs with IOC marketable orders.
- Use `NVDA_DUAL` for the dual listing; `long` and `short` may be either leg.
- Cooldown is per rule, clamped to 250–120,000 ms. Default is 1,500 ms.

## 6. Full custom example

```json
{
  "name": "Basis Hunter",
  "description": "Buy the cheap leg and sell the rich leg above 10 bps.",
  "family": "custom",
  "universe": ["NVDA", "PFE"],
  "params": { "qty": 4 },
  "risk": {
    "maxPosition": 40,
    "maxGross": 60000,
    "maxOrdersPerMin": 20
  },
  "rules": [
    {
      "when": [{ "field": "basisBps", "op": "gt", "value": 10, "instrument": "NVDA" }],
      "action": { "type": "pair", "long": "NVDA", "short": "NVDA_DUAL", "qty": 4 },
      "cooldownMs": 2000
    },
    {
      "when": [{ "field": "basisBps", "op": "lt", "value": -10, "instrument": "NVDA" }],
      "action": { "type": "pair", "long": "NVDA_DUAL", "short": "NVDA", "qty": 4 },
      "cooldownMs": 2000
    },
    {
      "when": [
        { "field": "sentiment", "op": "gt", "value": 0.55, "instrument": "PFE" },
        { "field": "spreadBps", "op": "lt", "value": 8, "instrument": "PFE" }
      ],
      "action": { "type": "order", "instrument": "PFE", "side": "buy", "qty": 3, "orderType": "ioc" },
      "cooldownMs": 4000
    }
  ]
}
```

## 7. Validation rules

The validator rejects a spec when:

- the file is not a JSON object;
- `name` is shorter than 3 or longer than 40 characters;
- `description` is longer than 280 characters;
- `family` is not one of the seven allowed values;
- `universe` is empty, longer than 5, or contains an unknown symbol;
- a parameter is not a finite number, or is outside the broad numeric range;
- `risk.maxPosition` is outside 1–100;
- `risk.maxGross` is outside 1,000–1,000,000;
- `risk.maxOrdersPerMin` is outside 1–120;
- a custom bot has no rules, more than 12 rules, a rule with 0 or more than 4 triggers, an unknown
  field/operator, a non-numeric trigger value, an invalid side, or a qty outside 1–100;
- a pair action is missing `long` or `short`;
- a bot name already exists on your account (checked at deploy).

Warnings (do not block deployment) include:

- an unused parameter for the selected family;
- `maxPosition` above 80;
- `maxOrdersPerMin` above 60;
- a cooldown outside 250–120,000 ms that was clamped;
- rules supplied to a non-custom family (they will be ignored).

## 8. Plan limits

| Plan | Active bots |
| --- | --- |
| Free | 2 |
| Pro | 10 |
| Desk | 50 |

A paused bot still counts toward the slot limit. Delete a bot to free a slot.

## 9. Lifecycle

1. `POST /api/bots` validates and creates the bot in `active` state.
2. The engine runs it every second tick (roughly twice per second at 1× speed).
3. Order-rate and gross-exposure guards are checked before every action.
4. Every 600 ticks a scoring round is recorded, contributing to win rate and Sharpe.
5. `POST /api/bots/:id/status` with `{"status":"paused"}` cancels the bot's resting orders.
6. `DELETE /api/bots/:id` removes the bot and cancels its orders. Its book is removed from P&L.
7. `PUT /api/bots/:id` replaces the spec of an existing bot; open orders are cancelled first.

## 10. Security model

- Uploaded bots are **data**, not code. There is no `eval`, `Function`, import, filesystem, network or
  timer access.
- Every bot gets a namespaced book: `u:<userId>:bot:<botId>`. The interpreter cannot read another
  account's positions or orders.
- Validation is performed server-side, not just in the browser.
- Request bodies are capped at 256 KB; bot files at 128 KB.
- The API requires an authenticated session for bot management, trading, strategy toggles and news
  publishing.
- Passwords are hashed with PBKDF2-SHA256 (100,000 iterations) and a per-user random salt.

## 11. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Bot is active but has no fills | Trigger never fires, risk room exhausted, or order-rate limiter reached. |
| “Position limit reached” | The account-level 100-share cap is already used by manual trades, strategies or another bot. |
| Bot stopped trading | Paused, deleted, gross-exposure cap reached, or the engine was idle with no clients connected. |
| Validation says “rules are ignored” | `rules` supplied with a non-`custom` family. |
| Custom bot never trades | Check `basisBps` units (already bps) and whether the trigger instrument is in `universe`. |
| Bot name rejected | Names are unique per account and must be 3–40 characters. |

## 12. Related documents

- [Platform rules](RULES.md)
- [Features, implementation and the real-market gap](FEATURES.md)
- [Business plan and pricing](BUSINESS_PLAN.md)
- Public docs page: `/docs/bots`
