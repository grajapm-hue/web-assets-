# 📁 MathsMatrix puzzle v1.31 — your personal copy

Keep this folder wherever you like. Nothing here talks to the internet and
nothing here can be changed by anyone else.

## About the two version numbers

You will see both **v1.31** and **v131** in this folder. They are the same code.

- **`MathsMatrix puzzle v1.31.html`** — your copy, numbered the tidier way. This
  is the one to keep, read, edit and publish.
- **`KidsMathsMatrixPuzzle.html`** and the loose files — left exactly as they are
  on the live site, still saying **v131**, so this folder is also a true
  untouched record of what was published on 6 August 2026.

Nothing else differs between them.

## What is in the folder

| File | What it is |
|---|---|
| **MathsMatrix puzzle v1.31.html** | ⭐ **The one to use.** The whole game in a single file — every picture and the music are inside it. |
| `sw-standalone.js` | Its partner **for publishing only** — this is what makes the published version work with no signal. Not needed for reading it from a folder. |
| `KidsMathsMatrixPuzzle.html` + 18 others | The original loose files, exactly as they sit on the live site |
| `START-HERE.md` | this page |
| `EDIT-THE-WORDS.md` | how to rename it for a different audience |
| `NEW-REPOSITORY.md` | how to publish a parallel version from a second account |
| `RESTORE-AND-FORK.md` | how to put v131 back on the live site |
| `SHA256SUMS.txt` | fingerprints, to prove nothing has been altered |

## Opening it on your phone (Markor)

1. Copy the folder to your phone
2. Open **MathsMatrix puzzle v1.31.html** in Markor
3. Markor shows the text — tap its **preview / open-in-browser** option to play it

Because everything is inside that one file, you can move it, rename it, mail it
to yourself or drop it in Google Drive and it still works. No other file has to
travel with it.

## What works from a folder, and what does not

| | From a folder | From a web address |
|---|---|---|
| All nine puzzles | ✅ | ✅ |
| Formula sheet pictures | ✅ | ✅ |
| Sounds and music | ✅ | ✅ |
| Works with no internet | ✅ | ✅ (after first visit) |
| **Add to Home Screen / install** | ❌ | ✅ |

**Why install does not work from a folder.** Phones only allow an app to be
installed from a real web address (`https://…`), never from a file sitting in
your storage. That is the phone's rule, not something in this code.

**Nothing has to be added later.** The app name and all three home-screen icons
are already built into the standalone file, and `sw-standalone.js` is already
written and tested. The day you decide to publish, you upload those two files and
installing works immediately — there is no extra preparation waiting to be done.

So: **the folder copy is for keeping, reading and editing. A web address is for
installing.** `NEW-REPOSITORY.md` shows how to make one, and records the test
where the network was switched off and the game kept playing.

## Checking nothing has been damaged

Years from now you can confirm the files are untouched. On Windows:

```
Get-FileHash .\KidsMathsMatrixPuzzle.html -Algorithm SHA256
```

Compare the result with the matching line in `SHA256SUMS.txt`.

---

## Verified before it was given to you

- Opened in an empty folder with no other files present — **made zero requests to
  anywhere**, proving nothing is missing
- An embedded formula sheet was decoded — 650 × 813, so the pictures really are
  inside the file
- The game solved a 3×3 by itself and all 8 lines came to 15
- Every checksum matched byte for byte
