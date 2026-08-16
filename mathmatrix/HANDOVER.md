# MathMatrix Pro++ — handover cheat sheet

**For whoever picks this up next: a new laptop, a different Claude account, or Raja on his own.**

Written 2026-08-16, when live was **v135** and the test build was **beta-154**.
Everything here has been done, not guessed.

---

## 1. The one thing that catches people out

**There are TWO repositories, and the one you edit is not the one children load.**

| | Repo | File | URL |
|---|---|---|---|
| **LIVE** — what children play | `KidsMathsMatrixPuzzle/kidsmathsmatrixpuzzle.github.io` | `index.html` at repo root | https://kidsmathsmatrixpuzzle.github.io |
| **TEST** — where changes are tried | `grajapm-hue/web-assets-` | `mathmatrix/beta.html` | https://grajapm-hue.github.io/web-assets-/mathmatrix/beta.html |

`mathmatrix/KidsMathsMatrixPuzzle.html` in the web-assets repo is only a **mirror**
of the live file. It is not served to anyone. It has drifted before — it sat at
v131 while live was already v132 — so **never read a version number off the
mirror. Read it off the live site.**

```bash
curl -s "https://kidsmathsmatrixpuzzle.github.io/?cb=$RANDOM" | grep -o "BUILD_VER = '[^']*'"
```

Both apps are a **single HTML file** each — all HTML, CSS and JavaScript inline,
about 530 KB. There is no build step, no npm, no framework. You edit the file.

---

## 2. What a new machine needs

| Tool | Why | Check it |
|---|---|---|
| **Git + GitHub CLI (`gh`)** | pushing, and publishing to the live repo | `gh auth status` |
| **Node.js** (v24 here) | runs the checks in `mathmatrix/tools/` | `node --version` |
| **Google Chrome** | the checks drive a real headless Chrome | must exist at `C:/Program Files/Google/Chrome/Application/chrome.exe` |

The GitHub account needs **write access to both repos**. Sign in once with:

```bash
gh auth login          # choose HTTPS, and let it set up git credentials
```

If Chrome lives somewhere else on the new machine, change the `CHROME` constant
at the top of each `mathmatrix/tools/check-*.js`.

Nothing else is installed. No `npm install`, no dependencies.

---

## 3. Making a change to the test build

1. Edit `mathmatrix/beta.html`.
2. **Bump the version, always** — see section 5, this is not optional.
3. Run the checks (section 6).
4. Commit and push to `main` on `grajapm-hue/web-assets-`.
5. Wait for GitHub Pages, then verify against the **served** file, not your local one:

```bash
curl -s "https://grajapm-hue.github.io/web-assets-/mathmatrix/beta.html?cb=$RANDOM" | grep -o "BUILD_VER = '[^']*'"
```

Pages caches for 10 minutes and takes a minute or two to build. Verifying the
local file proves nothing — leftovers have survived to the served file three
times in one session.

---

## 4. Promoting the test build to live

Three scripts, in order, from `mathmatrix/tools/`:

```bash
cd mathmatrix/tools

node promote-1-build.js v136      # beta.html -> _index-built.html, as v136
node promote-2-verify.js          # static + browser checks on the built file
                                  # STOP if this is not ALL GREEN
node promote-3-publish.js _commit-message.txt
```

`promote-3-publish.js` writes `index.html` **and** `sw.js` to the live repo in a
**single commit** through the GitHub API, so the page and the worker that caches
it can never be live in mismatched versions. Write your commit message into
`mathmatrix/tools/_commit-message.txt` first.

Then bump the live `sw.js` cache version — `promote-1-build.js` does not touch it.
Check `promote-2-verify.js` output; it tells you the version it built.

### Why promotion is not just a copy

The test build is **deliberately crippled so it can never shadow the real app**,
even installed on the same phone. Promotion must undo all of it — each of these
has broken a real release:

| Beta has | Live needs | What goes wrong otherwise |
|---|---|---|
| `beta-manifest.json`, name "(Beta)", `start_url: ./beta.html` | `manifest.json` | installs a home-screen icon that opens a **404** |
| `register('beta-sw.js', {scope:'./beta.html'})` | `register('sw.js')` | that scope **matches nothing** under the name `index.html` — the page silently gets **no service worker and no offline play** |
| cache `mathmatrix-beta-v*` | `mathmatrix-v*` | the two builds fight over the same cached pages |
| credit line "BETA — tell us what breaks" | "Found something odd? Tell us on the Feedback tab" | the word BETA ships to children |
| comments describing beta's narrow scope | rewritten | `index.html` documents the opposite of what it does |

`promote-1-build.js` does every one of these and prints what it changed. Read
that output — if a line says `CHECK` instead of `ok`, something did not match.

---

## 5. Version numbers — read this before touching one

**Two numbers must move together on every single change:**

| Where | Test build | Live |
|---|---|---|
| the HTML | `var BUILD_VER = 'beta-154 (...)'` | `var BUILD_VER = 'v135'` |
| the worker | `beta-sw.js`: `CACHE_VERSION = 'mathmatrix-beta-v154'` | `sw.js`: `CACHE_VERSION = 'mathmatrix-v135'` |

If the cache version does not change, **devices keep serving the old page from
cache and your change never appears** — you will think you shipped and you did not.

### The version label is the update mechanism, not decoration

`autoFresh()` refetches the page, pulls the version out of the text with a
**regular expression**, and reloads if it differs from the running one. That is
why an installed home-screen app updates itself with no "Update" tap — Raja
confirmed this working on v134 and again on v135.

```js
var m = txt.match(/BUILD_VER\s*=\s*'([^']+)'/);
```

So **`BUILD_VER` must stay a quoted literal**. Two ways this has broken:

- It used to match `window.BETA_VER` instead. When `BETA_VER` became a *derived*
  value (`BUILD_VER.split(' ')[0]`, itself a fix for the two numbers drifting
  apart), the regex found nothing, the function returned early every time, and
  the silent self-update died — with **every test still green**, because both
  values were correct. The fault was in a regex over text, which no assertion
  about live objects can see.
- **Reusing a version number** kills it just as dead: nothing differs, so nothing
  reloads.

`check-slide-rows.js` now applies the app's own regex to the shipped file and
fails if it stops finding the version. Do not delete that check.

---

## 6. The checks

All in `mathmatrix/tools/`. Each drives a real headless Chrome, prints PASS/FAIL
per claim, and ends with `ALL GREEN` or a failure count. Run them from that folder.

```bash
cd mathmatrix/tools
node check-slide-rows.js        # start here: it covers the most
```

| Script | What it protects |
|---|---|
| `check-slide-rows.js` | row red/green logic, one gap per board, block counts, block size, SaNa's hint fitting its bubble, version wiring, **the auto-update regex** |
| `check-board-fit.js` | the board and its buttons fit at 360×800, 390×844, 360×740 |
| `check-slide-levels.js` | the three levels, their grades, "Show me how" |
| `check-slide-drag.js` | real touch drags, both axes, on square and stretched blocks |
| `check-slide-picker.js` | the slide level cards' layout |
| `check-home-list.js` | the home puzzle list — pairing, no overlap, no overflow |
| `check-logic-sheet.js` | the LOGIC sheet's wording per board |
| `check-card-handlers.js` | cards still open their puzzles after markup moves |
| `check-all-puzzles.js` | **the standing regression across all 11 puzzles — run this before every push** |

Screenshots land in `mathmatrix/tools/shots/`. **Look at them.** Assertions have
passed while the screen was visibly wrong more than once this session — text
clipped mid-word, blocks squeezed to a quarter width, a whole button row pushed
off the bottom of the screen. Every one was caught by eye, not by a check.

---

## 7. Backups

Two zips, in `C:\Users\jeyan\Downloads\MathMatrix-backups\`:

- `mathmatrix-live-v135.zip` — the live app, complete PWA (worker, manifest,
  icons, cheat diagrams, music) plus a `RESTORE.md`
- `mathmatrix-test-beta-154.zip` — the test build, same idea

Rebuild them any time:

```bash
cd mathmatrix/tools
node make-backups.js            # stages into tools/_stage/{live,beta}
```

It pulls the live files **from the live repo**, never the mirror, and size-checks
every download. The beta asset list is read out of `beta-sw.js` rather than typed
by hand — that file *is* the definition of what beta needs offline.

Then zip the two staged folders (PowerShell):

```powershell
Compress-Archive -Path "...\tools\_stage\live\*" -DestinationPath "...\mathmatrix-live-vNNN.zip"
Compress-Archive -Path "...\tools\_stage\beta\*" -DestinationPath "...\mathmatrix-test-beta-NNN.zip"
```

---

## 8. Traps that cost real time

**`cache.addAll()` rejects wholesale if a single listed file 404s.** One phantom
entry means the worker caches **nothing** and offline play is dead with no error
anyone would notice. `beta-sw.js` once listed a `cheat-binary.png` that had never
existed, and beta had no offline play for as long as it was there. If you add a
file to the cache list, confirm it exists in the repo.

**A CSS comment terminator in the wrong place silently kills the rules after it.**
This happened three times. Before any browser test, check the balance:

```bash
node -e "const h=require('fs').readFileSync('mathmatrix/beta.html','utf8');h.replace(/<style[^>]*>([\s\S]*?)<\/style>/g,(m,c)=>{const o=(c.match(/\/\*/g)||[]).length,x=(c.match(/\*\//g)||[]).length;if(o!==x)console.log('UNBALANCED',o,x);return m});console.log('checked')"
```

**An apostrophe inside a single-quoted string breaks the whole script.** One in
`BUILD_VER` stopped `fitHome()` ever running, and the symptom looked like a
layout bug, not a syntax error.

**Verify against the served file, never the local one.**

---

## 9. Raja's standing design rules

These were all decided after real feedback. Do not quietly reverse them.

- **Every puzzle and every level is open. No locks, no unlock ladder, no PIN.**
  Decided in v64 after parent-group feedback: the audience runs from small
  children to adults. Gate Logic reintroduced gating once by mistake and it was
  removed again in beta-131.
- **The questions are an offer, not a toll gate.** Gate Logic has a **Skip ▶** in
  every room. In his words, the puzzle is for "both type of ones, who either more
  curiosity to love math and nor just use as fun and time pass".
- **Every sliding board has exactly ONE empty space**, like a real physical board.
  He asked twice. 26 letters can only do that at 3×9, so the letter board is a
  narrow board with wide rectangular blocks.
- **Rows, not blocks.** A row is red until every block in it is right, then green,
  and red again the moment a slide disturbs it. He corrected an earlier per-block
  version: *"you wrongly understand my suggestion."*
- **Colour means one thing at a time.** Green = this row is done. Amber = the move
  you are making now. He rejected three greens meaning three different things.
- **The additive magic-square series stops at 10×10.** Bigger grids are the same
  method with more arithmetic and teach nothing new. New *kinds* of puzzle
  instead — that is where Gate Logic and Slide Magic came from.
- **Ship features with pictures.** He reviews by screenshot and catches what
  assertions miss.

---

## 10. Where things stand

**Live: v135.** Gate Logic with Skip and all levels open; Slide Magic's three
boards; the paired home list; the version and auto-update fixes.

**Test: beta-154.** Same as live plus nothing outstanding — they were promoted
together.

**In design, not built:** **Pallanguzhi** — the traditional Tamil 14-cup game, which Raja wants for family play.
The open rule questions are in `mathmatrix/pallanguzhi-questions.txt` (Tamil and English) and are with his family.
Nothing can be built until Q1 is answered — whether a cup reaching 4 (Pasu) goes to the row's OWNER or to whoever
is sowing — because it changes the whole shape of the game. Two play modes were agreed: two players passing one
phone first, then the app as an opponent for solo training.

**Open question, never answered:** on the slide win screen the "Rows done: N of N"
counter disappears at the moment the last row completes, because the code blanks
it when everything is done (`beta.html`, search `doneRows === SLIDE_ROWS`). It
may read better showing "4 of 4". Raja has not said either way.

---

## 11. If you are a Claude session reading this cold

Read section 1 first and confirm which repo you are in. Then:

```bash
git -C <repo> log --oneline -15
```

The commit messages are long on purpose. They record *why* a thing is the way it
is, what was tried and rejected, and which of Raja's words prompted it — usually
more useful than reading the diff.

Do not trust a passing test as proof the screen looks right. Take the screenshot
and look at it.
