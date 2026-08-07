# ✏️ Changing the words

You can rename the whole app — for older students, for a school, for a different
subject — **without touching a single line of puzzle code**.

## Where to edit

Open **MathsMatrix-puzzle-v1.31.1.html** in Markor (or any editor).
The very first thing in the file, before anything else, is this:

```
╔══════════════════════════════════════════════════════════════════╗
║  ✏️  EDIT ZONE — change the WORDS here.                          ║
╚══════════════════════════════════════════════════════════════════╝

window.BRAND = {
  appName:    "🐒🎲 MathMatrix Pro++",
  pageTitle:  "🐒🎲 MathMatrix Pro++ — Magic Square Puzzles",
  subtitle:   "🐒 Kids Puzzle · for 5th grade & up",
  tagline:    "“Maths and monkeys — neither sits in one direction.”",
  credits:    "Created by G.RajaPathamuthu · Kids Puzzle Library",
  guidedBy:   "Guided by : JNT",
  mailTo:     "grajapm@gmail.com",
  shareUrl:   "https://kidsmathsmatrixpuzzle.github.io"
};
```

Change the text **between the quote marks**. Save. Open it again. Done.

## What each line changes

| Line | Where it shows |
|---|---|
| `appName` | the big title at the top of the app |
| `pageTitle` | the browser tab, and the name under the home-screen icon |
| `subtitle` | the small line under the title — who it is for |
| `tagline` | the motto in gold-to-green colours |
| `credits` | the first credit line at the bottom |
| `guidedBy` | the second credit line |
| `mailTo` | where the ✉️ Feedback link sends mail |
| `shareUrl` | the address the 📤 Share button passes on |

## An example — an edition for adults

```
window.BRAND = {
  appName:    "🧮 Number Workshop",
  pageTitle:  "Number Workshop — Magic Squares",
  subtitle:   "Classical magic squares · for adults and senior students",
  tagline:    "“Patterns, not pictures.”",
  credits:    "Compiled by G. RajaPathamuthu",
  guidedBy:   "Guided by : JNT",
  mailTo:     "your-other-address@gmail.com",
  shareUrl:   "https://your-new-site.github.io"
};
```

This exact example was tested — the title, subtitle, motto, credits, tab name and
the feedback address all changed, and **the 3×3 still solved correctly with all
eight lines at 15**. The mathematics is untouched by renaming.

## Two rules

1. **Keep the quote marks and the comma** at the end of each line. If a line goes
   red or the app opens blank, a quote mark or comma has gone missing.
2. **Do not scroll far down the file.** Everything after the puzzle code is the
   pictures and the music converted into text — many thousands of characters of
   letters and numbers. It is meant to look like that. Never edit it.

## What you cannot change from the EDIT ZONE

The puzzle names (3×3, 4×4, 🎂 Sir Ramanujan MathMagic and so on), the tips, and
the Math Logic explanations are written inside the page itself. They can be
changed too, but that means editing the page text directly — tell me and I will
mark those regions the same way.

## Colours

The look is set further down in the style section. If you want a plainer,
more grown-up appearance — no monkey, quieter colours, denser layout — that is
a bigger change than words, and it is exactly what a separate adults' edition
would be for. See `NEW-REPOSITORY.md`.
