# Play Store listing copy

Ready to paste into Play Console. Character limits are Play's; the counts below
are checked by `node tools/check-listing.mjs`, which fails if any field grows
past its limit.

---

## App title
> MathBlast — Math Arcade

Alternatives if that one is taken:
- `MathBlast: Math Defence`
- `MathBlast Math Game`

## Short description
> Solve the math to stop the beasts. No ads, no tracking, plays offline.

This is the line shown under the title in search results, and it is doing two
jobs: saying what the game is, and saying what it is not. For this audience the
second half is the differentiator — a parent scanning an education category
full of ad-supported free apps is looking for exactly that sentence.

## Full description

> **The math is not a quiz between the fun parts. The math *is* the game.**
>
> Beasts are falling toward your planet. The only way to stop one is to solve
> it — and every problem is drawn as the thing it actually means.
>
> A 7 × 8 beast is a countable 7-by-8 grid, so multiplication looks like area.
> An asteroid marked "? × ? = 48" fractures into two chunks physically sized 6
> and 8. A prime glows red and refuses to break, so the only way through is to
> name it — nobody is told what a prime is, the rock teaches it by being
> unbreakable. A fraction crystal has a wedge missing and facets you can count.
> A child who is stuck can always count something on the screen.
>
> **THREE DIFFICULTIES, THREE CURRICULUMS**
>
> Not the same questions sped up — each tier teaches different material.
>
> • EASY (grades 1–3) — single-digit adding and subtracting shown as base-ten
> blocks, times tables to nine, division as equal groups. Nothing above nine.
> • MEDIUM (grades 4–6) — two-digit arithmetic, times tables to twelve,
> factors and primes, unit fractions, one-step equations.
> • HARD (grade 7) — negative numbers, fractions with unlike denominators,
> percentages, squares and roots, two-step equations.
>
> **IT LEARNS WHAT YOUR CHILD FINDS HARD**
>
> MathBlast remembers how fast and how accurately each fact is answered, and
> sends the ones they are slowest on around more often. The star chart turns
> that into a sky — one star per times-table fact, brightening as it is learned,
> joining into a constellation when a whole row is mastered. "I've got my
> fives" becomes something you can see.
>
> Everything stays on the device. Two children sharing a tablet get their own
> progress rather than averaging into one blurred learner.
>
> **NO ADS. NO TRACKING. NO ACCOUNTS.**
>
> No advertising. No analytics. No sign-up, no email, no data collected of any
> kind — the game makes no network calls at all and works completely offline,
> on a plane or in a car. You pay once and that is the entire business model.
>
> **BUILT TO BE PLAYED, NOT ENDURED**
>
> A fully synthesized soundtrack that follows how well you are doing — play
> well and the music literally brightens into a major key. Wrong answers never
> buzz or scold; the beast just gets closer and the problem stays on screen.
> Full-screen arcade graphics, one-handed touch controls, and a colour-safe
> palette and reduced-motion mode for players who need them.
>
> Open source under the GPL. Every claim above can be checked against the code
> at github.com/mmorrisj/MathBlast

---

## Play Console answers

**Data Safety**
- Does your app collect or share any of the required user data types? **No**
- Is all of the user data collected by your app encrypted in transit? *(N/A — nothing is collected)*
- Do you provide a way for users to request that their data be deleted? *(N/A — nothing leaves the device; uninstalling removes it)*

**Privacy policy URL**
- `https://mmorrisj.github.io/MathBlast/privacy.html` (update if the site moves)

**Content rating questionnaire** — the answers are all the mild end:
- Violence: none. Cartoon shapes are destroyed; there are no characters, no
  blood, no injury, no weapons pointed at people.
- Sexuality, profanity, drugs, gambling: none.
- User interaction: **none** — no chat, no sharing, no user-to-user contact.
  Player names are stored on the device and shown only on that device.
- Shares location: no. Digital purchases: *(yes only if the unlock ships.)*

**Target audience**
- Age groups: 5 and under is too young for the reading; **6–8, 9–12 and 13–15**
  match the three tiers, with 16+ also true.
- Appeals to children: **yes**. This opts the app into the Families policy,
  which requires no ads or only certified non-personalised ones, no uncertified
  SDKs, and no unfenced external links. MathBlast has none of the three.

**Ads** — Does your app contain ads? **No.**

**Category** — Education (primary). Play also allows Educational under Games;
Education is the better fit for how this audience searches.

**Tags** — math, education, arithmetic, times tables, multiplication, fractions,
learning, kids, offline, arcade

## Graphics checklist

| Asset | Size | Where |
| --- | --- | --- |
| App icon | 512×512 | `assets/icons/icon-512.png` ✅ |
| Feature graphic | 1024×500 | `docs/store/feature-graphic.jpg` ✅ — JPEG because Play's feature graphic must carry no alpha channel, and a canvas PNG always does |
| Phone screenshots (≥2, landscape) | ≥1080px wide | `docs/*.png` — `screenshot.png`, `tier-easy.png`, `boss.png`, `starchart.png`, `orbs.png`, `near-miss.png` ✅ |
| Promo video (optional) | YouTube URL | Not made yet — lifts conversion more than any other single asset |
