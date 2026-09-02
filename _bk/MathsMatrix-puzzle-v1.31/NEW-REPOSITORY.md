# 🌱 Publishing a parallel version from a second account

This makes a **separate site**, on a **separate Google account**, that installs to the home screen like a real app — while the kids version here carries on updating independently. Neither can break the other.

## Before you start

I cannot do this part. Creating an account and typing a password is something only you can do. Everything after the account exists, I can help with.

## Steps

### 1. The account

Create the new Google account. Turn on 2-step verification and save the recovery codes somewhere safe — if that account is lost, the site goes with it.

### 2. The repository

Sign in to GitHub with the new account and create a repository named exactly:

```
<username>.github.io
```

Nothing else. That exact name is what gives you the short address `https://<username>.github.io` instead of a long one. Make it **Public** — GitHub Pages will not serve a private repository on a free account.

### 3. Upload — two files

| Upload this | Renamed to |
| --- | --- |
| `MathsMatrix-puzzle-v1.31.1.html` | **`index.html`** |
| `sw-standalone.js` | `sw-standalone.js` (keep the name) |

That is all. The pictures, the music and the app icons are already inside the first file.

**Why the second file matters.** `index.html` alone installs to the home screen and plays perfectly — but only while there is internet. `sw-standalone.js` is what makes it keep working with **no signal at all**, which is the whole point for a bus, a train or a village with no coverage.

**Do not upload the ordinary ****`sw.js`**** instead.** That one is written for the folder version and goes looking for sixteen separate files — `cheat-3x3.png`, `bgm-monkeys.mp3` and so on. In the single-file edition those files do not exist, so it fails and you silently lose offline play. `sw-standalone.js` knows there is only one file to look after.

### 4. Switch the site on

In the repository: **Settings → Pages → Source → Deploy from a branch → main → / (root) → Save.**

Wait a minute or two, then open `https://<username>.github.io`.

### 5. Rename it

Edit the EDIT ZONE at the top of `index.html` (see `EDIT-THE-WORDS.md`) and set `shareUrl` to your new address so the Share button passes on the right link.

## Installing it to the home screen

Once it is at a real address it installs properly:

- **Android / Chrome** — menu ⋮ → *Add to Home screen* (or an Install banner)
- **iPhone / Safari** — Share ⬆️ → *Add to Home Screen*

The icons and app name are already built into the file, so it appears as a proper app with its own icon.

### This was tested, not assumed

The two files above were served as a real website and checked:

| Check | Result |
| --- | --- |
| Page requested nothing but itself | ✅ no missing assets |
| Service worker installed and activated | ✅ |
| App name and **all three icons** found | ✅ 192, 512, 512-maskable |
| Opening the icon lands on the right page | ✅ |
| **Network switched off and the server stopped, then reloaded** | ✅ still played |
| All nine puzzles present with no internet | ✅ |
| A formula-sheet picture still displayed offline | ✅ |

One fault was found and fixed during that test: the app's start address still pointed at the old filename `KidsMathsMatrixPuzzle.html`. Once published as `index.html`, tapping the home-screen icon would have opened a **"page not found"**. It now opens the site root, so any filename works.

**Note.** If you install both editions on one phone they each get their own icon and each works offline. They do not interfere.

## One thing to get right if both live on the same address

If you ever put both editions under **one** site (say `/kids/` and `/pro/`), give the second one a different cache name — open `sw.js` and change:

```
const CACHE_VERSION = 'mathmatrix-v131';
```

to something like `mathmatrix-pro-v1`. If both use the same name they fight over the same offline storage and people get served the wrong edition.

On two **separate** addresses this cannot happen, which is why two accounts is the simpler and safer arrangement.

## What the two editions share

Both carry the same puzzle engine and the same verified mathematics:

| Puzzle | Every line makes |
| --- | --- |
| 3×3 · 4×4 · 5×5 | 15 · 34 · 65 |
| 6×6 · 8×8 · 10×10 | 111 · 260 · 505 |
| 3³ Multiply | 4096, which is 16 × 16 × 16 |
| 🎂 Sir Ramanujan | your own birthday total, from any date |
| 🔢 Number guess | all 99 numbers decode exactly |

So a correction to the mathematics only ever has to be made once, then copied across. It is the appearance and the wording that differ between editions.

## Keeping them in step later

When you want a change from the kids version brought over, send me both files and I will move just that change across — or tell me what to bring and I will prepare the new file for you to upload.