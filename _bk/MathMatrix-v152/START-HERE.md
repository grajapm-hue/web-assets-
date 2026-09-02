# 📁 MathMatrix Pro++ **v152** — your personal copy

Taken from the live site on **1 September 2026**.

Keep this folder wherever you like. Nothing in it talks to the internet, nothing in it can be changed by anyone else, and nothing in it needs my machine, this chat, or any remote connection. It is complete on its own.

> If you want to carry on working with a **different Claude account**, with no dependence on the current setup, read **`CONTINUE-WITH-CLAUDE.md`**. It has a ready-made opening message to paste.

## The two copies of the game

| File | Size | Use it for |
| --- | --- | --- |
| **`EDIT-THIS-MathMatrix-v152.html`** | 886 kB | ⭐ reading and editing. Opens fine in Markor. |
| **`PUBLISH-THIS-MathMatrix-v152.html`** | 5.5 MB | playing anywhere, and uploading to a site. One file, nothing beside it. |
| `index.html` | 886 kB | the published page, untouched — a true record. Leave it alone. |

Both copies are the same game. The difference is only where the pictures and the music are kept.

- **EDIT** keeps them as separate files beside it. Longest line **729**

  characters**, so a phone editor opens it instantly.**

- **PUBLISH** keeps them *inside* the page as text. That is what makes it work

  from a folder with no signal — but it contains a single line of **676,117   characters**, which is why a phone editor shows a blank screen on it.

**So: edit the EDIT one, publish the PUBLISH one.** Never try to edit the publish copy on a phone.

## What is in the folder

| File | What it is |
| --- | --- |
| `EDIT-THIS-MathMatrix-v152.html` | ⭐ the one to work on |
| `PUBLISH-THIS-MathMatrix-v152.html` | the single-file copy for playing and publishing |
| `sw-standalone.js` | its partner **for publishing only** — this is what makes a published copy work with no signal |
| `index.html`, `sw.js`, `manifest.json` | the published files, exactly as served |
| the 8 `cheat-*` pictures | the formula sheets, as loose files (already inside the publish copy) |
| `bgm-monkeys.mp3` | the music (already inside the publish copy) |
| `icon-192/512/512-maskable.png` | the home-screen icons |
| `MultiplyMagic3.html`, `sound-lab.html`, `design-preview.html` | the side pages on the same site |
| `START-HERE.md` | this page |
| `CONTINUE-WITH-CLAUDE.md` | how to carry on from a **separate Claude account** |
| `WORKFLOW.md` | the edit → check → publish loop |
| `EDIT-THE-WORDS.md` | how to rename it for a different audience |
| `NEW-REPOSITORY.md` | how to publish a parallel version from a second account |
| `RESTORE-AND-FORK.md` | how to put v152 back if something goes wrong |
| `SHA256SUMS.txt` | fingerprints, to prove nothing has been altered |

## Opening it on your phone

**To read or edit** — open `EDIT-THIS-MathMatrix-v152.html` in **Markor**, from inside Markor's own file browser (not "Open with").

**To play** — open `PUBLISH-THIS-MathMatrix-v152.html` in **Chrome**. Because everything is inside that one file, you can move it, rename it, mail it to yourself or drop it in Google Drive and it still works. No other file has to travel with it.

## What works from a folder, and what does not

|  | From a folder | From a web address |
| --- | --- | --- |
| All 11 puzzles | ✅ | ✅ |
| Formula sheet pictures | ✅ | ✅ |
| Sounds and music | ✅ | ✅ |
| Works with no internet | ✅ | ✅ (after first visit) |
| **Add to Home Screen / install** | ❌ | ✅ |

**Why install does not work from a folder.** Phones only allow an app to be installed from a real web address (`https://…`), never from a file sitting in your storage. That is the phone's rule, not something in this code.

**Nothing has to be added later.** The app name and all three home-screen icons are already built into the publish copy, and `sw-standalone.js` is already written and tested. The day you decide to publish, you upload those two files and installing works immediately.

## This was tested, not assumed

The publish copy was copied **alone into an empty folder**, opened with the **network switched off at the browser**, and played from there:

- all 11 puzzles opened and were playable
- all 8 formula sheets drew their own picture, from inside the file
- the music is inside the file, with no filename left to fetch
- **it never reached for anything on the web** — not one request

The check that proves this is `check-backup-bundle.js`, kept with the project.