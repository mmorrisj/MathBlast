# Getting twelve testers

Play will not grant production access to a personal developer account created
after 13 November 2023 until twelve testers have been opted in to a closed test
**continuously for fourteen days**. This is the longest single item on the road
to launch and the one most likely to go wrong, so it gets its own page.

## The reframe that makes this easy

Twelve testers sounds like a chore invented by Google. For this game it is not,
because **the testers and the audience are the same people**: parents of
6-to-13-year-olds, and teachers. Twelve families playing MathBlast for a
fortnight is the playtest the game should have anyway, and it produces the one
thing a new listing cannot buy — people who have actually used it and can review
it in week one.

So do not recruit twelve warm bodies to satisfy a counter. Recruit twelve
households with a child in the right grade band, and ask them real questions.
The requirement is then a side effect.

## The rule, precisely

- **Twelve distinct Google accounts**, each having clicked the opt-in link and
  joined the test through the Play Store.
- **Continuously for fourteen days.** They must overlap. Twelve on day one and
  eleven on day seven does not accumulate — it restarts.
- **An email sitting in the tester list is worth nothing.** It counts only once
  that person has actually opted in.
- Uninstalling afterwards does not appear to remove someone from the count, but
  do not lean on that.

There is also widespread advice that Google looks at whether testers were
genuinely *engaged* rather than merely opted in. Treat that as a reason to have
real testers rather than as a rule with a threshold — see the caveat at the
bottom.

**So recruit sixteen to eighteen, not twelve.** Somebody will change phones,
lose interest, or never manage step 3. Recruiting exactly twelve means one
dropout costs fourteen days.

## Where twelve actually come from

In rough order of how quickly they say yes:

1. **Your own household and family.** Every adult with an Android phone and a
   Google account counts. This is usually two to four.
2. **Friends with primary-school children.** The ask is easy because the thing
   being asked is "let your kid play a maths game for two weeks".
3. **One or two teachers.** A primary maths teacher is the highest-value tester
   on this list — they will tell you whether EASY matches how the material is
   actually taught, which is a thing only they know.
4. **A homeschool group.** These are the people most likely to say yes to a
   stranger, and most likely to buy afterwards.
5. **Your child's classmates' parents**, if that is a group you are already in.
6. **Coworkers**, who need no child at all — they can play HARD and tell you
   whether the game is any good as a game.
7. **Reciprocal testing threads** — `r/androiddev` and similar run "I'll test
   yours if you test mine" posts. Legitimate, and they fill the last two or
   three slots. They will not give you useful feedback; they give you a count.

**Be careful with paid tester farms.** They are the loudest voice in the search
results on this topic, because the companies selling them wrote most of the
articles about it. They fill the counter with people who have no interest in
your app, which is the exact thing the engagement check exists to catch, and it
is your account that carries the risk. This game does not need them — the
audience is reachable and sympathetic.

**Note on children's accounts.** Use the *parent's* Google account for the opt
in. Child accounts supervised through Family Link are a needless complication,
and the child can play on the parent's install regardless.

## The step everyone gets wrong

Opting in is three steps and most people fail step 2 silently. Send this, not a
link on its own:

> **How to join the MathBlast test**
>
> 1. On your **Android phone**, open this link:
>    `https://play.google.com/apps/testing/com.mmorrisj.mathblast`
> 2. **Check the Google account shown at the top of that page is the same one
>    you gave me**, and the same one your phone's Play Store uses. This is the
>    step that goes wrong — if your phone signs into a different account than
>    your computer, the opt-in silently does nothing.
> 3. Tap **Become a tester**, then follow the "download it on Google Play" link
>    and install as normal.
>
> Please **stay opted in for at least two weeks** — leaving early resets a
> fourteen-day clock for me and I have to start over. Play as much or as little
> as you like; staying in is the part that matters.

Then confirm each one individually in Play Console rather than trusting replies.
People say "done!" when they have opened the link on a laptop.

## What to actually ask them

The fortnight is free playtesting. Four questions worth more than a rating:

- **Was the difficulty right on the first run?** Tier choice is the thing most
  likely to be wrong, and a child who bounces off wave 2 is data.
- **Did they understand what to do without being told?** Nobody explains what a
  prime is; the rock is supposed to teach it. Did that land?
- **Did they come back a second time unprompted?** This is the only retention
  number you will get, and it is the honest one.
- **What did the parent think when they saw the progress page?** That page is
  the pitch to the person holding the money. If it does not land, the listing
  needs rewriting before launch, not after.

## The alternative: an organization account

Organization Play Console accounts are **exempt** from this requirement
entirely. If you already have a registered business entity with a D-U-N-S
number, this route skips the fourteen days completely and is worth taking.

If you do not, it is probably slower rather than faster: obtaining a D-U-N-S
number can take up to thirty days, and organization verification is reported to
take a further two to four weeks, with business details that must match your
registration documents exactly. Twelve testers is faster than four weeks of
paperwork, and unlike the paperwork it makes the game better.

## Timeline

Start the clock before anything else is finished. The `.aab` uploaded to closed
testing does not have to be the launch build — it has to exist.

| | |
| --- | --- |
| Day 0 | Account, verification, first `.aab` to closed testing, opt-in link in hand |
| Day 1–3 | Send the invite. Chase until twelve are **confirmed in the console**, not twelve who said yes |
| Day 3–17 | The fourteen days. Ask the four questions; fix what comes back |
| Day 17 | Apply for production access |

## A caveat on all of the above

Google's own help page for this requirement is the authoritative source and
should be read directly before relying on any of this. Almost everything else
written about the twelve-tester rule is published by companies that sell tester
recruitment, and they have an obvious interest in making the requirement sound
harder and its engagement checks sound stricter than they are. The numbers here
— twelve, fourteen days, continuous, organization accounts exempt — are
consistent across sources and match Google's published policy. The finer claims
about how engagement is judged are not something to plan around.
