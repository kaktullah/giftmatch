# GiftMatch

Describe a gift recipient in a short questionnaire and get a ranked shortlist of
**real, buyable gifts** from real Dutch shops (bol.com, Coolblue, Amazon.nl), each
with a price, a store link and a one-line reason why it fits.

> Status: steps 1–5 of the roadmap. With an `ANTHROPIC_API_KEY` the full AI pipeline runs;
> without one the app uses rule-based demo ranking. The `/eval` personas come next.

## Run it locally

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install            # install dependencies
cp .env.example .env   # create your local settings file
npm run db:push        # create the local SQLite database
npm run dev            # start the app on http://localhost:3000
```

Without an `ANTHROPIC_API_KEY` in `.env` the app runs in **demo mode** (no AI calls).
With a key, it uses `ANTHROPIC_MODEL_CONCEPTS` (cheap, default Claude Haiku 5.5) for gift
concepts and `ANTHROPIC_MODEL_RERANK` (stronger, default Claude Sonnet 5.5) for ranking and
reasons. If an AI step fails twice, the request falls back to demo ranking instead of erroring.

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Run the unit tests (filters, ranking, providers) |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Lint the code |
| `npm run catalog:generate` | Rebuild `data/catalog.json` from `data/catalog-source.txt` |

## How it works

```
questionnaire → recipient profile → AI: gift concepts → product providers (stores)
             → hard filters in code → AI: rerank + reasons → top 10 + wildcard
```

- **Product providers** (`src/lib/providers/`): every store or affiliate network is a
  `ProductProvider`. `MultiProvider` asks several at once and merges the results, so
  the app is never tied to one shop. Choose sources with `PRODUCT_PROVIDERS` in `.env`
  (comma-separated). Today there is one: `catalog`.
- **Catalog** (`data/catalog-source.txt` → `data/catalog.json`): ~200 real products.
  Prices are approximate and links open the store's search page for that exact
  product, because there is no live feed yet. Live prices and stock come later via
  affiliate programmes (bol.com Partner Programme, Awin, Amazon Associates).
- **Hard filters** (`src/lib/filters.ts`): budget, in stock, ships to the country,
  arrives before the deadline, clothing allowed, avoid list. These run in code, never
  in the AI.
- **Questionnaire** (`src/app/find/`, `src/lib/intake.ts`): 6 short steps, validated with Zod,
  turned into a recipient profile. Free text and the avoid list are never stored.
- **Demo ranking** (`src/lib/demoRecommend.ts`): used until the AI steps exist. Same rules
  as the real pipeline: provider products only, hard filters, max 2 per category, wildcard,
  "More like this" / "Not this".
- **Ranking helpers** (`src/lib/ranking.ts`): dedupe, max 2 per category, wildcard pick.
- **Logging** (`prisma/schema.prisma`): anonymised requests, shown items and clicks.
- **AI pipeline** (`src/lib/ai/`): concepts → provider search → hard filters → rerank. Both
  steps use structured outputs validated with Zod, retry once, and log tokens and cost (€)
  per request. Product ids the model returns that aren't real candidates are dropped.
- **Prompts** live in `/prompts` as versioned files (`concepts.v1.md`, `rerank.v1.md`).

## Adding a store

1. Create `src/lib/providers/MyStoreProvider.ts` implementing `ProductProvider`.
2. Register it in `src/lib/providers/index.ts`.
3. Add its name to `PRODUCT_PROVIDERS`, e.g. `PRODUCT_PROVIDERS=catalog,mystore`.

Providers must only return products that really exist in their source.
