# Selling MathBlast

Notes on taking the game from "a repo that happens to be playable" to something
a parent buys for the price of a coffee. Written against what is actually in
this repo today, not against a generic launch checklist.

## Where it stands

Four facts about the current state decide most of what follows.

- **The game is free and public right now.** The repo is public, GitHub Pages is
  on, and every asset is served straight from the repo root with no build step.
  Anyone with the URL has the whole game, and anyone with the repo has the
  source.
- **There is no `LICENSE` file.** Absent one, the default is *all rights
  reserved* — nobody may legally redistribute it — but the default is also
  invisible, and "no licence" reads to most people as "unclear" rather than
  "mine". This is the single cheapest thing to fix and it blocks nothing else.
- **There is no purchase code of any kind.** No billing, no entitlement, no
  gating, not even a seam where one would go. Every tier is reachable from the
  title screen the moment the page loads.
- **The game collects nothing and calls nothing.** That is a real asset. The
  Data Safety declaration is "no data collected", COPPA and GDPR-K are trivially
  satisfied, and there is no server to keep alive or pay for.

## The decision that shapes everything else

Because the source is public, the thing being sold cannot be *access to the
code*. It has to be something a public repo does not already give away.

The honest options, in ascending order of work:

**Sell the packaged app, keep the web version free.** The web build stays where
it is as a permanent, fully playable demo; the paid product is the Play Store
install — offline, its own icon, no browser chrome, wake lock, back button,
the lot. This is what `capacitor.config.json` is already set up to produce.
People pay for convenience and the store's trust, not for bits they could
otherwise fetch. It is how most small DRM-free games actually sell, and it
requires **zero changes to game logic**.

**Sell content the free version does not have.** Gate MEDIUM and HARD, or gate
past wave 9, and charge to unlock. Higher conversion per install, but it means
building an entitlement path (below), and it means the public repo has to stop
containing the paid content — either the repo goes private or the gated tiers
live outside it. That is a real cost: the repo's openness is currently part of
the project's appeal.

**Both.** Free web demo → free install → one unlock. This is the highest-
converting shape and the most work.

My recommendation is the first for launch and the third only if the first
sells. A paid-up-front app with nothing to try converts terribly; a free
install with a playable EASY tier and one unlock button converts far better,
but you will not know whether the game has an audience at all until something
ships. Ship the cheap version, learn, then decide.

## Price

**$2.99 one-time.** Reasons, not preferences:

- It clears the psychological "is this worth thinking about" bar without being
  free, and free apps in the education category are assumed to be ad-supported.
  A price is a signal that there are no ads.
- Under Play's Families programme, ads are the expensive path — certified SDKs,
  non-personalised only, age screens for mixed audiences. A paid app or a single
  unlock sidesteps all of it. Being paid is *cheaper to comply with* than being
  free.
- One-time, not subscription. A subscription on a single-player arcade game is a
  churn machine and a support burden, and parents are hostile to them.

Play is the merchant of record: it collects, refunds and remits tax in every
territory. That is worth a great deal at this scale and is the main reason to
prefer the store over selling directly.

If the game later grows a second curriculum (a geometry tier, say), that is a
second $2.99 unlock, not a price rise.

## What has to be built

For the "sell the packaged app" route: **nothing in `src/`.** The build already
exists (`npm run app:aab`). What is missing is paperwork, not code.

For the entitlement route, the seam is small and the codebase is already shaped
for it:

- `src/difficulty.js` exports `TIERS` as a flat array. A `locked: true` flag on
  medium and hard, honoured wherever the title screen renders the tier picker,
  is the whole gate.
- `src/profiles.js` is the only module that touches `localStorage` and already
  handles private-mode failure by degrading rather than throwing. An `entitled`
  flag belongs there, written from the billing callback, read once at boot.
- The purchase call itself is a Capacitor plugin (Play Billing), so it exists
  only in the packaged build. The web build reads `entitled` as `false` and
  shows the tiers as a "get the app" prompt instead of a paywall — the web
  version should never try to take money.

Two cautions. Anything stored in `localStorage` is trivially editable by a
determined nine-year-old, which is *fine*: the goal is to make buying easier
than circumventing, not to build DRM. And a Families-programme app needs its
purchase flow to be non-deceptive and clearly disclosed — check the current
Families monetisation requirements in the console before wiring the button,
because that policy moves.

## What has to be filed, and how long it takes

`docs/ANDROID.md` covers the build. The release path around it has one item that
dominates the schedule:

**A personal Play Console account created after 13 November 2023 must run a
closed test with at least 12 testers opted in continuously for 14 days before it
can apply for production access.** Organisation accounts are exempt. This is not
a review queue you can hurry — it is fourteen calendar days that start when you
have twelve real people on the test, and losing testers restarts the clock.

So the timeline is:

| | |
| --- | --- |
| Day 0 | $25 developer account, identity verification (can itself take days) |
| Day 0 | Upload the first `.aab` to internal testing, install it on your own phone |
| Day 1–3 | Recruit twelve testers. Friends, family, a teacher or two — they need Google accounts and they must stay opted in |
| Day 3–17 | The 14-day window. Use it: this is your playtest, not a formality |
| Day 17 | Apply for production access |
| Day 17+ | Review, typically days for a first submission, sometimes longer for a children's app |

Budget a month from "I want to sell this" to "it is buyable", and none of that
month is engineering.

Alongside the binary:

- A **privacy policy at a public URL** saying the game collects nothing. It has
  to exist even though it says "nothing". Host it on the same GitHub Pages site.
- The **Data Safety** declaration: no data collected, no data shared.
- The **content rating** questionnaire.
- **Store listing copy**, a 512×512 icon (already at
  `assets/icons/icon-512.png`), a 1024×500 feature graphic (does not exist yet)
  and at least two landscape screenshots (`docs/` already has ten good ones).
- A **target age declaration**, which puts the app under the Families policy and
  commits you to no ads, no uncertified SDKs and no unfenced external links.

## Measuring it without analytics

Being Families-compliant means no analytics SDK in the app, which sounds like
flying blind and is not. Play Console reports install counts, store-listing
conversion rate and acquisition by traffic source **from Play's own side, with
nothing in the binary**. Tag every link you post with UTM parameters and the
console will tell you which channel converted.

What you lose is in-app behaviour — where players quit, which tier they pick,
whether anyone reaches wave 20. Accept losing it. The star chart and score table
already give you that information from any device you can physically borrow, and
a playtest with six children in a room is worth more than a funnel chart.

The one number that matters early is **store-listing conversion**: of the people
who reach the page, how many install. Under ~15% means the listing (icon,
screenshots, first line of description) is the problem, not the game.

## Channels, cheapest first

The audience is not gamers. It is parents of 6-to-13-year-olds, homeschoolers
and primary teachers — and they do not read game press.

**Free, and where the actual buyers are:**

- **Homeschool communities.** Facebook groups, `r/homeschool`, curriculum
  forums. These convert on $3 tools better than anything else on this list.
  Read each group's self-promotion rule first; the ones that allow it usually
  require you to be a participant, not a drive-by.
- **Teacher communities.** `r/teachers`, `r/matheducation`, primary-maths
  Facebook groups, and district newsletters if you know anyone inside one.
- **A single good post about the design.** "The math *is* the graphics" is a
  genuinely interesting idea and the README argues it well — a `7 × 8` beast
  that is a countable 7-by-8 lattice, an asteroid that fractures into
  proportionally sized chunks, a prime that physically refuses to split.
  That post belongs on Hacker News and `r/gamedev`. It will not sell many
  copies directly; it builds the credibility everything else borrows.
- **itch.io.** Free to list, takes an optional cut, and hosts the web build
  directly. It is a second storefront and a second discovery surface for the
  cost of an upload.

**Cheap, and worth it:**

- **A landing page that is not the game.** Right now the Pages URL boots
  straight into a canvas. A buyer needs a page with the screenshots, the
  curriculum table, the price, and one button. The tier table and the beast
  table in the README are 80% of that page's copy already.
- **A 30-second video.** The near-miss slow-motion frame, an asteroid
  fracturing, a boss ring shattering. Play's listing takes one and it lifts
  conversion more than any other single asset.
- **Teachers Pay Teachers.** An unusual channel for a game, but it is where
  teachers already spend small amounts of money, and a $3 listing there is a
  day's work.

**Skip:** paid user acquisition. At $2.99 with no in-app spend, there is no
lifetime value to bid against — you would be buying installs at a loss on
purpose. Also skip app-review sites that charge for coverage.

## The order I would do it in

1. Add a `LICENSE`. Decide openly whether the code is open and the *app* is
   what sells, or the whole thing is proprietary. Either is defensible; the
   ambiguity is not.
2. Write the privacy policy and publish it on the existing Pages site.
3. Build the landing page, again on Pages, and point the root at it with the
   game one click away. Do this before the store account — it is where every
   link you ever post will go.
4. Open the Play account and get the first `.aab` into internal testing the same
   day, because the 14-day clock is the long pole.
5. Recruit twelve testers while the listing assets get made.
6. Ship at $2.99 with the web version left free and prominent.
7. Post the design write-up the week *after* launch, not the week of — you want
   a live link in it.
8. Only after there is a sales number worth reading, decide whether to build
   the free-install-plus-unlock version.

## What this does not solve

An App Store release. Apple does not accept a wrapped web view as a game the way
Play does; that route means a real port, and it is a different project. The PWA
installs fine on iOS from Safari, so the free web version covers iPhone users —
just not as something you can charge for.
