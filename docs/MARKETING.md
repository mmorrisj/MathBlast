# Selling MathBlast

The plan: the game stays free to play on the web, the Play Store app is what you
buy, and the whole thing is ad-free and collects nothing. These are notes on
what that actually takes, written against what is in this repo today.

## The thing to settle first

The two features usually named as the reason to buy the app — **offline play**
and **saving progress** — are already in the free web version, and not by
accident. `sw.js` precaches all 41 files, `npm test` fails if that list drifts
from disk, and there is a test asserting the game boots and plays with the
network off. `src/profiles.js` keeps a per-player fact history in
`localStorage`, and the star chart draws it back. Add to Home screen on a phone
gets an icon, fullscreen, landscape lock, a wake lock, and a game that runs on
a plane.

So a paid app whose pitch is "offline and saves your progress" is selling
something a buyer already has for free, and the first parent to notice will say
so in a review. The split has to be built, not asserted.

There are three honest ways to build it.

**Sell convenience and trust, and say so.** The app is the same game, findable
by searching the Play Store rather than by having the link, installed the way
people actually install things. The purchase is partly a tip. This is how a lot
of small open projects fund themselves and it is completely defensible — but
conversion is low, and it only works if the pitch is honest about what it is:
*this is the same game, buying it pays for the work.*

**Build something for buyers that does not exist yet.** The strongest candidate
is already 90% present in the data model and shown to nobody: `problems.js`
keeps `{ema, misses, seen}` for every fact, per profile. That is a **progress
report** — what this child knows cold, what they are slow on, what they have not
met yet — and it is the thing a parent or a teacher would actually pay three
dollars for. It needs no server and no data collection: the report is generated
on the device from data that is already there, and exported as a file the parent
keeps. Pair it with **backup and restore**, which the web version genuinely
cannot do well, because a browser can drop `localStorage` (a cache clear does
it, and iOS evicts storage for sites that are visited and not installed).

**Limit the demo.** Cap the free version at EASY, or at wave 9, and sell the
rest. Higher conversion, and the option I would take last: the free version is
currently the entire marketing asset, and cutting it down to a trailer costs
more reach than the extra conversions are likely to be worth at this price.

My recommendation is the second, layered on the first. Nothing is taken away
from the free version — buyers get an addition, which is a much easier thing to
sell and a much easier thing to feel good about.

## Price

**$2.99, one-time.** One-time rather than a subscription, which on a
single-player arcade game is a churn machine and a support burden. Not free,
because a free app in the education category is assumed to be ad-supported, and
a price is the cheapest way to signal that it is not.

Being paid is also the *cheaper* compliance path. Declaring a child audience
puts the app under Play's Families policy, and that is where ads get expensive:
certified ad SDKs only, non-personalised only, a neutral age screen for a mixed
audience. A paid app with no ads and no analytics sidesteps all of it. The
constraint and the principle point the same direction here.

Play is the merchant of record — it collects, refunds and remits tax
everywhere — which is worth a lot at this scale and is the main reason to prefer
the store over selling direct.

## The no-data promise, kept literally

The game makes no network calls once it is running. That is worth protecting
because it is unusual, and because it makes the paperwork trivial:

- **Data Safety declaration**: no data collected, no data shared.
- **COPPA and GDPR-K**: satisfied by having nothing to collect.
- **No analytics SDK**, which is a Families requirement and also just correct.

Two consequences to plan around. Backup has to be a **file the parent exports
and keeps**, not a cloud account — the moment there is a server, the promise
needs a privacy policy that says something more complicated than "nothing".
And you will have no in-app telemetry, which is fine (see below).

## What has to be built

For the report-and-backup route, the seams are small and the code is already
shaped for them:

- `src/problems.js` owns the fact table. The report is a read of it — grouping,
  sorting and a verdict per fact. No new state.
- `src/profiles.js` is the only module touching `localStorage`, and already
  degrades rather than throws when storage is unavailable. Export and import
  belong there: serialise a profile plus its fact history to JSON, read it back.
- `src/ui/starchart.js` is the closest existing screen to a report and the
  natural place to hang "export" off.
- The paid-only gate wants one flag, read once at boot, written from the Play
  Billing callback in the packaged build and hard-`false` in the web build. The
  web version should never try to take money.

Do not build DRM around it. A flag in `localStorage` is editable by a determined
nine-year-old and that is fine — the goal is to make buying easier than
circumventing, not impossible to circumvent.

## Licensing

The game is **GPL-3.0-only** (`LICENSE`). Anyone may read, fork, build and
redistribute it, and anything derived from it has to stay under the same
licence — which rules out someone taking the code closed and selling it, but
explicitly does *not* rule out someone building the app themselves and giving it
away. That is a legitimate use, and the licence is the decision to allow it.

So the paid listing is not protected by copyright, and it is worth being clear
about what does protect it:

- **The name.** "MathBlast" and the store listing are not part of the licence
  grant. A fork may exist; it may not call itself this or use these icons and
  screenshots. Play's impersonation policy is the enforcement route if one tries.
- **Being the official one.** The listing linked from the site, with the reviews
  and the install count, is the one people find and trust.
- **Convenience.** Almost nobody who would pay $2.99 for a maths game will
  instead install the Android SDK and build an `.aab`.

The consequence for the paid feature: the progress report will be GPL too, so it
is not a secret and cannot be one. That is fine — it is not secrecy that makes
it worth buying, it is that it is finished, installed, and one tap away.

**GPLv3 and Apple's App Store terms conflict**, and Apple has pulled GPL apps
over it — but that bites projects with *multiple* copyright holders, and you are
the sole author. The GPL is a licence you grant to others; it does not bind you,
so the same code can go to the App Store under Apple's terms while the repo
stays GPL. What would take that option away is merging someone else's patch
without a contributor agreement in place. See
[COMPLIANCE.md](COMPLIANCE.md).

**The typeface is settled and separate.** JetBrains Mono is SIL Open Font
License 1.1, free for commercial use, and JetBrains explicitly does not require
attribution. The OFL does require the licence travel with the font when it is
redistributed, which shipping an APK is, so `assets/font/OFL.txt` now sits
alongside the `.woff2` — in the precache, and therefore in the Android build via
`tools/build-www.mjs`.

## What has to be filed, and how long it takes

`docs/ANDROID.md` covers the build. One item around it dominates the schedule:

**A personal Play Console account created after 13 November 2023 must run a
closed test with at least 12 testers opted in continuously for 14 days before it
can apply for production access.** Organisation accounts are exempt. It is not a
queue you can hurry — fourteen calendar days that start once twelve real people
are opted in, and losing testers restarts the clock.

| | |
| --- | --- |
| Day 0 | $25 developer account and identity verification (can take days on its own) |
| Day 0 | First `.aab` to internal testing, installed on your own phone |
| Day 1–3 | Recruit twelve testers — real Google accounts, opted in and staying in |
| Day 3–17 | The 14-day window. Use it as the playtest it should be |
| Day 17 | Apply for production access |
| Day 17+ | Review; typically days for a first submission, longer for a children's app |

Budget a month from decision to purchasable, and almost none of it is
engineering. Alongside the binary: a privacy policy at a public URL (it has to
exist even though it says "nothing"), the Data Safety declaration, the content
rating questionnaire, a target age declaration, store listing copy, the 512×512
icon (`assets/icons/icon-512.png`), a 1024×500 feature graphic (does not exist
yet) and landscape screenshots (`docs/` has ten good ones already).

## Measuring it without analytics

No analytics SDK sounds like flying blind and is not. Play Console reports
installs, store-listing conversion and acquisition by traffic source from Play's
own side, with nothing in the binary. Tag every link you post with UTM
parameters and the console tells you which channel converted.

The number that matters early is **store-listing conversion**: of the people who
reach the page, how many install. Much under ~15% and the listing is the
problem — icon, first screenshot, first line of the description — not the game.

What you lose is in-app behaviour: where players quit, which tier they pick,
whether anyone reaches wave 20. Accept losing it. Six children in a room for an
afternoon will tell you more than a funnel chart would, and the star chart
already shows you what a player learned on any device you can borrow.

## Channels, cheapest first

The audience is parents of 6-to-13-year-olds, homeschoolers and primary
teachers. They are not gamers and they do not read game press.

- **Homeschool communities** — `r/homeschool`, curriculum forums, Facebook
  groups. These convert on $3 tools better than anything else here. Read each
  group's self-promotion rule first; most want a participant, not a drive-by.
- **Teacher communities** — `r/teachers`, `r/matheducation`, primary-maths
  groups. The progress report is the hook for this audience specifically.
- **One good post about the design.** "The math *is* the graphics" is a real
  idea and the README argues it well: a `7 × 8` beast that is a countable
  7-by-8 lattice, an asteroid that fractures into proportionally sized chunks,
  a prime that physically refuses to split. That belongs on Hacker News and
  `r/gamedev`. It sells few copies directly and buys the credibility everything
  else borrows. Post it the week *after* launch so it carries a live link.
- **itch.io** — free to list, hosts the web build directly, a second storefront
  and a second discovery surface for the cost of an upload.
- **A landing page that is not the game.** The Pages URL currently boots
  straight into a canvas. A buyer needs a page with screenshots, the curriculum
  table, the no-ads-no-tracking promise, and one button. The tier table and the
  beast table in the README are most of that copy already.
- **A 30-second video** — the near-miss slow-motion frame, an asteroid
  fracturing, a boss ring shattering. Play's listing takes one and it lifts
  conversion more than any other single asset.

**Skip paid acquisition.** At $2.99 with no in-app spend there is no lifetime
value to bid against; you would be buying installs at a loss deliberately.

## The order I would do it in

1. ~~Add a `LICENSE`.~~ Done — GPL-3.0-only.
2. Write the privacy policy; publish it on the existing Pages site.
3. Build the landing page, also on Pages, with the game one click away. Do this
   before the store account — it is where every link you ever post will point.
4. Build the progress report and the export/import backup. This is the actual
   product work and the only engineering on the list.
5. Open the Play account and get an `.aab` into internal testing the same day.
   The 14-day clock is the long pole; start it before the report is finished.
6. Recruit twelve testers while the listing assets get made.
7. Ship at $2.99, with the free web version left up and linked prominently.

## What this does not solve

An App Store release, though it is a later decision rather than a closed door:
$99 a year against Play's $25 once, a Mac to build on, and guideline 4.2 to
argue past. [COMPLIANCE.md](COMPLIANCE.md) covers what each store wants. The PWA
installs fine from Safari either way, so iPhone users have the free version
today.
