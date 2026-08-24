# Store compliance

What Google Play and the App Store each require, what this repo already
satisfies, and what is actually left to do. `docs/ANDROID.md` covers *building*
the Android app; this is about getting either store to accept it.

## The starting position is unusually good

Most of what trips up a children's education app is a thing the app *does*, and
MathBlast does almost none of them. Checked against the source rather than
assumed:

| | |
| --- | --- |
| **No network calls once loaded** | `sw.js` serves everything from cache; the only fetch is picking up a new version. There is a test asserting the game runs with the network off. |
| **No external links** | Nothing in `src/` or `index.html` opens a URL — no `<a>`, no `window.open`, no `location.href`. This is the single most common Families/Kids rejection and it cannot happen here. |
| **No ads, no analytics, no third-party SDKs** | There are no runtime dependencies at all. Capacitor is packaging only. |
| **No accounts, no sign-in** | Nothing to delete, so Play's account-deletion requirement does not apply. |
| **No user content leaves the device** | Player names go in `localStorage` and are shown only on that device's own score table. Local-only text is not user-generated content in the sense either store means, so no moderation obligation attaches. |
| **Two device APIs, neither gated** | `navigator.wakeLock` and `navigator.getGamepads`. Neither needs an Android permission or an iOS usage-description string. |

Both stores' privacy declarations are therefore the easy answer — **no data
collected, no data shared** — and it is true rather than argued.

What remains is paperwork, money, and one licensing decision.

## Google Play

Covered in more detail in `docs/ANDROID.md`. What compliance specifically needs:

**Account and access**
- $25 developer registration, one time, plus identity verification.
- A personal account created after **13 November 2023** must run a closed test
  with **at least 12 testers opted in continuously for 14 days** before it can
  apply for production access. Organisation accounts are exempt. This is the
  long pole in the whole schedule and no part of it is engineering.
  [`docs/store/testing.md`](store/testing.md) covers where twelve testers come
  from, the opt-in step most of them get wrong, and what to ask them.

**Declarations, all blocking**
- **Privacy policy at a public URL.** Written: `privacy.html`, served by Pages
  at `https://mmorrisj.github.io/MathBlast/privacy.html`. It is deliberately not
  in the precache — it is a web page for the store listing, not part of the app.
- **Data Safety**: no data collected, no data shared.
- **Content rating** questionnaire. Cartoon sci-fi with no blood or characters;
  this comes out at the bottom of every scale.
- **Target audience and age declaration.** Declaring a child audience opts the
  app into the **Families policy**, which requires no ads or only certified
  non-personalised ones, no uncertified SDKs, and no unfenced external links.
  MathBlast satisfies all three by having none of them — but note that this
  becomes a permanent constraint, not a one-time answer. Adding an analytics
  SDK later means re-declaring.
- **COPPA and GDPR-K** compliance, satisfied by collecting nothing.

**Technical**
- Play requires new uploads to target a recent Android API level, and the
  requirement moves every year. Capacitor 7 targets a current level and
  `docs/ANDROID.md` builds against platform 36; check the deadline in force when
  you upload rather than trusting this sentence.
- An `.aab`, not an `.apk`, signed with an upload key kept out of the repo.

**Store listing**: all drafted in `docs/store/listing.md`, with the console's
Data Safety, content-rating and target-audience answers filled in alongside the
copy. `npm run listing` checks each field against Play's character limits and
writes the paste-ready plain text. The 512×512 icon is
`assets/icons/icon-512.png`, the 1024×500 feature graphic is
`docs/store/feature-graphic.jpg` (`npm run graphic`), and `docs/` has ten
landscape screenshots against a required minimum of two.

## The App Store

Harder, and for reasons that are mostly not about the game.

### The licence question, which is not the blocker it looks like

GPLv3 and Apple's App Store terms genuinely conflict: Apple imposes DRM and
per-device usage limits that the GPL forbids anyone from adding, which is why
Apple pulled VLC. So a GPL app on the App Store is a real problem —

— **for a project with multiple copyright holders.** It is not a problem here.
You are the sole author, and the GPL is a licence *you grant to others*; it does
not bind you. You can ship the same code to the App Store under Apple's terms
while the repo stays GPL-3.0. That is ordinary dual licensing and it is what
every commercially-backed open source project does.

**The thing that would take that option away is accepting a contribution.** The
moment someone else's patch is merged, they hold copyright on it under the GPL,
and you can no longer relicense the whole without their permission. If an App
Store release is ever wanted, PRs need a contributor licence agreement — or a
line in `CONTRIBUTING.md` stating that contributions are assigned to the project
owner — put in place *before* the first outside PR, not after.

### Guideline 4.2, "minimum functionality"

Apple rejects apps that are a website in a wrapper. This is the real review
risk, and the honest read is that it is moderate rather than fatal: 4.2 targets
thin shells around a live site, and MathBlast is a fully bundled offline game
that never touches the network. Hybrid games do ship on the App Store. What
argues the case, all already true:

- Every asset is bundled; the app works in airplane mode from first launch.
- There is no URL bar, no navigation, no web affordances — it is a fullscreen
  canvas.
- It is a real game with its own synthesized audio engine, not a document.

What would strengthen it if a reviewer pushes back: native Capacitor plugins
doing real work — haptics on impact, Game Center for the leaderboard, native
IAP — so the app is demonstrably more than its web build.

### The rest

- **$99 a year**, recurring, against Play's $25 once. At $2.99 a copy that is
  about 40 sales a year before the listing pays for itself.
- **A Mac with Xcode** to build, sign and upload. There is no way around this,
  and it is a real barrier if you do not have one.
- **The iOS platform is not set up.** `package.json` has `@capacitor/android`
  only. Adding it is `npm i -D @capacitor/ios && npx cap add ios`, plus
  `app:ios` scripts mirroring the Android ones. Not added here because none of
  it can be verified without a Mac.
- **App Privacy "nutrition label"**: no data collected.
- **Age rating** questionnaire, which lands at 4+.
- **The Kids Category is optional.** Opting in gets curated placement and the
  parents browsing it, and requires no third-party analytics or ads, a privacy
  policy, and a parental gate on any external link — all of which MathBlast
  already meets. It also brings tighter review. Worth taking for this app.
- **In-app purchase must use Apple's IAP** for digital goods, same as Play.

## What actually has to be built or written

Short list, in the order it blocks things:

1. ~~A privacy policy at a public URL.~~ Done — `privacy.html`.
2. ~~A 1024×500 feature graphic.~~ Done — `docs/store/feature-graphic.jpg`.
3. **A `CONTRIBUTING.md` with a CLA or assignment clause** — only if iOS is ever
   wanted, and only worth anything if it exists before the first outside PR.
4. **The iOS platform**, if pursuing Apple: `@capacitor/ios`, a Mac, $99.

Everything else on both lists is a form to fill in, and the answers are all
"none".

## The recommendation

**Ship Play first and treat Apple as a later, separate decision.** Play is $25
against $99 a year, needs no Mac, has no 4.2 equivalent, and accepts the exact
artifact `npm run app:aab` already produces. The fourteen-day tester window
means starting it early costs nothing and delaying it costs weeks.

The one thing worth doing *now* even if Apple is never pursued is the
contributor agreement, because it is cheap today and impossible to retrofit
once someone has contributed.
