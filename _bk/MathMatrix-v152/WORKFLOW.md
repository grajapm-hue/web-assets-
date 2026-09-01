# 🔁 Two files, two jobs

You have one file for **editing** and one for **publishing**. They hold the
same game. Use each for what it is good at.

| File | Size | Longest line | Use it for |
|---|---|---|---|
| **`EDIT-THIS-MathMatrix-v152.html`** | 886 kB | 729 | changing words, tips, puzzle tables |
| **`PUBLISH-THIS-MathMatrix-v152.html`** | 5.5 MB | 676,117 | playing anywhere, and uploading to a site |
| `index.html` | 886 kB | 729 | the untouched original — leave it alone |

## Why two

The publish copy has the music, the 8 formula sheets and the icons written
inside it as text. That makes one file that works anywhere, with no signal and
nothing beside it — but that single 676,117-character line is why a phone
editor shows a blank screen when you try to open it.

The edit copy keeps those as separate files beside it. Its longest line is 729
characters, so it opens instantly and behaves normally in Markor.

## The loop

1. **Edit** `EDIT-THIS-MathMatrix-v152.html` in Markor — or ask Claude to, see
   `CONTINUE-WITH-CLAUDE.md`.
2. **Check it** by opening that same file in Chrome, from the same folder.
   Everything works, including the formula sheets and the music, **as long as
   the loose `cheat-*` pictures and `bgm-monkeys.mp3` are in that folder** —
   they are, in this bundle.
3. **Change the version.** Find `var BUILD_VER` (near line 15387) near the bottom and give it a new
   number, or returning visitors keep the old copy from their cache.
4. **Rebuild the publish copy** — the single-file version with everything
   folded back in. Claude can do this, or publish the simple way below.
5. **Publish** the new publish copy as `index.html`, together with
   `sw-standalone.js`. See `NEW-REPOSITORY.md`.

## If you only want to publish the simple way

You do not have to rebuild the single-file copy at all. You can publish the
**edit copy** and upload the loose picture files beside it — that is exactly how
the site is arranged today. Use `sw.js`, not `sw-standalone.js`, for that
arrangement.

| You publish | Upload beside it | Service worker to use |
|---|---|---|
| the **edit** copy | the 8 `cheat-*` files, `bgm-monkeys.mp3`, the 3 icons, `manifest.json` | `sw.js` |
| the **publish** copy | nothing | `sw-standalone.js` |

Getting this pair wrong is the one mistake that matters: the stock `sw.js`
caches a dozen files **by name**, so pairing it with the single-file copy makes
it fail to install, and you silently get no offline play at all.

## Adding a new puzzle

Find `var PUZZLES = {` (near line 5092). Each entry is one puzzle: its size, its
tips, and the worked example the Watch demo plays back. To add one, copy a whole
entry, change its key and its numbers, then add a matching button in the
difficulty list (search for `data-size=`).

**Have the arithmetic checked before publishing.** Every square has to hold up:
every row, every column and **both diagonals** reaching the same total, with
each number used exactly once. The 3-cube square is magic by **product**, not
sum.

## Which app for which job

| Job | App |
|---|---|
| Editing the words or tables | **Markor** — open from inside Markor's own file browser, not "Open with" |
| Playing with sound and music | **Chrome** (or Firefox, Samsung Internet, Edge) |
| Best, once published | **Install it** to the home screen — own icon, own window, full sound, works with no signal |

Markor is a text editor; its preview cannot play audio. That is a limit of
Markor, not of these files.
