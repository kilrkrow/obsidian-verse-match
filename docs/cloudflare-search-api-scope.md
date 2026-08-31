# Cloudflare verse search API: lift estimate

Go/no-go scope only. No Worker, no wrangler, no new paid Cloudflare resources. Consumer is Verse Match (`D:\_dev\obsidian-verse-match`). Do not change that plugin until Guy says go.

Tennoshare as built is Express + Postgres + Docker/Portainer, Cloudflare Tunnel + Access, GHCR, git-backed CI. The shape Guy means here is the *other* Tennoshare: a git repo, push deploys to the Cloudflare edge, small API, no VPS.

## Cost (read this first)

**Running this on Workers Free is $0/month if you stay inside the daily caps.** There is no per-query invoice. Hitting a cap does not bill you; it errors until the next UTC midnight. The real spend is build time (about a day of Prototyper / agent tokens). Cloudflare dollars only appear if you flip the account to Workers Paid ($5/mo class plan) or if you add Vectorize / Workers AI later (we would not).

Numbers below are today's published docs, not a dashboard screenshot. Confirm on the Cloudflare dashboard before go.

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (updated 2026-08-28), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) (updated 2026-04-21), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

### Workers Free

- 100,000 requests/day
- 10 ms CPU per invocation
- 128 MB memory
- Over: **Error 1027** until 00:00 UTC. The Worker stops serving. Nothing is charged.

### D1 Free

- 5 million rows read/day
- 100,000 rows written/day
- 5 GB storage per account
- 500 MB per database
- Over: D1 returns errors until 00:00 UTC. Search is down until reset. Upgrading to Paid lifts the cap (typically within minutes).

### Workers Paid

Minimum **$5 USD per month** per account if they leave Free. Confirm the current dashboard price. Paid includes 10 million Worker requests/month and much larger D1 write allotments (first 50 million rows written/month). Not required for personal Obsidian use **if the loader is split**.

### Rebuild spike (the only Free-tier landmine)

~31k verses x 4 translations = **~124k INSERTs**. D1 also counts FTS index writes (an index write is an extra row written). A `DELETE` of the previous load counts as writes too. A naive weekly full reload is well over 100,000 writes in one GitHub Action and **will exhaust Free writes in a single run**. Then D1 errors until UTC midnight.

Mitigations (pick one; do not "just reload all four"):

1. Split by translation across days (one ~31k load per UTC day; FTS writes still need headroom, so maybe one translation every other day).
2. Flip to Workers Paid for that day, run the full reload, stay Paid or drop back (Paid is $5 for the month you are on it, not a one-day pass).
3. Incremental load: only INSERT/UPDATE verses whose text changed. Steady-state weekly delta should be tiny.

### Query path (cheap)

One FTS `SELECT` per search. Personal Obsidian use will not hit 100k requests/day or 5 million reads/day. This is not the cost problem.

### GitHub Actions

Public repo minutes are ~$0. This job is a short fetch + SQL load. No paid Cloudflare SKU is required to stay on Free if the rebuild is split.

### What you actually spend

| Item | Money |
|---|---|
| Worker + D1 serving searches, on Free, split loader | **$0/mo** |
| Naive full rebuild on Free | $0, but **search dies** until UTC reset |
| Workers Paid (optional, for a one-shot full load) | **$5 that month** |
| Build | **~1 day of agent tokens.** That is the real spend if they stay on Free and split the loader. |

This section does not change go/no-go. It only makes the bill (and the write cap) impossible to miss.

## 1) Recommended Cloudflare shape

**Worker + D1 (FTS5).** Not Pages, not KV, not Vectorize for v1.

- **Worker** is the API. One route, JSON in/out. Pages is for sites; a Pages Function would work but it is still a Worker with extra ceremony.
- **D1** is SQLite at the edge with FTS5. That is the closest Cloudflare analogue to Tennoshare's `pg_trgm` fuzzy item search, without standing up Postgres. Four public-domain translations of ~31k verses each fit comfortably. Rebuild is a SQL load, not a container.
- **KV** is a key/value map. Fine for "give me John 3:16", useless as a search index.
- **R2** is a good *staging* bucket for the HelloAO dump if we do not want 20MB JSON in git. The Worker should not download and scan 20MB per query.
- **Vectorize** would help paraphrase matches ("only Son" vs "only begotten Son") later. Skip for v1: extra product surface, embeddings pipeline, and it is how you accidentally leave the free tier. Lexical FTS covers the Verse Match bar (`For God so loved the world...` -> John 3:16).

Vs Tennoshare's Docker stack: no Portainer, no GHCR image, no Tunnel, no Postgres disk. CI is `wrangler deploy` + `wrangler d1 execute` on push to `main`. Same "git is the deploy button" feeling, much smaller blast radius.

## 2) Data pipeline

HelloAO has dumps and chapter files. It has **no** search HTTP route. We already locked that: Verse Match caches `complete.simple.json` locally. This service is the online query option, not a second dump format.

**Allowlist (index these, period):**

| HelloAO id | Abbr | Why |
|---|---|---|
| `eng_kjv` | KJV | US public domain |
| `eng_web` | WEB | public domain |
| `eng_asv` | ASV | public domain |
| `BSB` | BSB | HelloAO free-text, same list bible-verse already treats as `mode: "text"` |

**Do not index:** NIV, ESV, NASB, NLT, NKJV, AMP, CSB, or anything bible-verse marks `linkOnly` / `apiKeyText`. NET, LSV, and similar have their own licenses; leave them out of v1 even if HelloAO hosts a dump.

**Build story (on GitHub Actions, not on a VPS):**

1. Fetch `https://bible.helloao.org/api/{id}/complete.simple.json` for the four ids (KJV dump is ~22MB).
2. Compact to `(translation_id, book, chapter, verse, text)`. Strip pilcrows, footnotes, words-of-Jesus offsets. Expect ~4 to 6MB SQL total, not 80MB of raw dumps.
3. Load into D1, then rebuild the FTS5 virtual table. **Do not `DELETE`+reload all four translations in one Action** on Workers Free (see Cost). Split by translation across days, incremental upsert, or Paid for that month.
4. Run on every push that touches the loader, and on a weekly cron so HelloAO corrections show up without a human.

Do **not** commit the 22MB dumps to git. Commit the loader script. Optionally store the compact rows as a gzipped artifact in the Action, not as source.

Index size: ~31k rows x 4 = ~124k rows. Trivial for D1 storage (500 MB/db Free). The constraint is **writes/day**, not gigabytes.

## 3) API sketch

Public read API. No user accounts. Optional shared secret later if scrapers become a problem; do **not** bake a key into the Obsidian plugin.

```
GET /search?q={text}&translation=eng_kjv&limit=8
```

`translation` is a HelloAO id from the allowlist. Default `eng_kjv`. `limit` default 8, max 20.

```json
{
  "translation": "eng_kjv",
  "abbr": "KJV",
  "query": "For God so loved the world",
  "matches": [
    {
      "book": "John",
      "chapter": 3,
      "verse": 16,
      "text": "For God so loved the world, that he gave his only begotten Son, ...",
      "score": 0.97,
      "token": "{John 3:16}"
    }
  ]
}
```

`token` omits the translation abbreviation when `translation` is the caller's default (Verse Match passes bible-verse's `defaultTranslation`). Include `, KJV` only when the searched translation is not that default.

Also ship `GET /health` and `GET /translations` (the allowlist). Nothing else in v1.

Rate limit with Cloudflare's built-in WAF/rate limiting on the free plan if it ever gets noisy. CORS: allow `app://obsidian.md` and `http://localhost` if needed; `requestUrl` from Obsidian does not need browser CORS, but a future web caller might.

## 4) Lift

**Time:** about a day, not a week. Half a day for Worker + D1 schema + loader Action + a curl that returns John 3:16. A couple of hours to point Verse Match at it with the local cache as fallback. Buffer a half day for D1 bulk-insert quirks and FTS ranking.

**Free-tier fit:** serving searches is free. The write cap is the landmine; details in Cost. No Vectorize, no Workers AI, no paid zone required. Use the existing kilrkrow Cloudflare account. No new paid resources unless Guy chooses Paid for a full rebuild.

**Legal leftover:** serving KJV (US), WEB, ASV, and BSB text from our edge is the same class of use as HelloAO already documents (no key, no commercial restriction on those texts). Keep attribution in README (`text from HelloAO / respective PD licenses`). Recheck BSB terms once at go time; if anything looks off, drop BSB and keep the three PD translations. Never add ESV via a plugin-held API.Bible or Crossway key.

**What Verse Match would change (only after go):** keep `complete.simple.json` cache as offline fallback. When online, `requestUrl` this Worker first with the same `translation` id it already reads from bible-verse. Classifier stays; the API returns candidates, the plugin still decides 1:1 vs chooser. One new setting, default on: "Search online (Cloudflare)". No API key field.

## 5) What we would not do

- Index or return NIV, ESV, NASB, NLT, NKJV, CSB, AMP, or other publisher-locked texts.
- Put an API.Bible, ESV, or any shared publisher key in the Obsidian plugin (or in a public Worker).
- Recreate Tennoshare's Docker/Postgres/Tunnel stack for a verse search.
- Vectorize / embeddings in v1.
- Wrangler deploy, D1 create, or any paid Cloudflare SKU as part of this estimate.
- Replace the local HelloAO cache; this is a complement, not a hostage.

## Go / no-go

Go if Guy wants verse-match queries to hit the edge instead of a 20MB first-run download, and is fine with four free/PD translations only.

No-go if the local cache is good enough, or if he wants NIV/ESV in the index. That second path is a publisher license, not a Worker.
