# 🔁 Two files, two jobs

You now have one file for **editing** and one for **publishing**. They hold the same game. Use each for what it is good at.

| File | Size | Use it for |
| --- | --- | --- |
| **EDIT-THIS-MathsMatrix-v1.31.1.html** | 142 kB | changing words, adding puzzle tables |
| **PUBLISH-THIS-MathsMatrix-v1.31.1.html** | 2.4 MB | playing with music, and uploading to GitHub |
| `KidsMathsMatrixPuzzle.html` | 144 kB | the untouched original — leave it alone |

## Why two

The publish copy has the music and the pictures written inside it as text. That makes one file that works anywhere — but it contains a **single line of 641,946 characters**, which is why a phone editor struggles and why "Open with Markor" showed a blank screen.

The edit copy has no music inside. Its longest line is **1,087 characters**. It opens instantly and behaves normally in Markor.

## The loop

1. **Edit** `EDIT-THIS-…html` in Markor — change the words in the EDIT ZONE at

   the top, or add puzzle tables further down (search for    `THE PUZZLE TABLES START HERE`)

2. **Check it** by opening that same file in Chrome. Everything works except the

   music, which is expected — there is none inside it. If you want music while    testing, put `bgm-monkeys.mp3` in the same folder and it will find it.

3. **Send me the edited file.** I check the mathematics of anything new, run the

   tests, and rebuild the publish copy with the music and pictures put back in.

4. **Publish** the new `PUBLISH-THIS-…html` as `index.html`, together with

   `sw-standalone.js` — see `NEW-REPOSITORY.md`.

## Adding a new puzzle table

Find `THE PUZZLE TABLES START HERE` in the edit copy. Each entry is one puzzle: its size, its tips, and the worked example the Watch demo plays back. To add one, copy a whole entry, change its key and its numbers, then add a matching button in the difficulty list below it (search for `data-size=`).

**Send it to me before publishing.** Every square has to be checked — that every row, every column and **both diagonals** reach the same total, and that the numbers are each used once. I test all nine existing puzzles that way on every change, and a new one should be no different.

## Which app for which job

| Job | App |
| --- | --- |
| Editing the words or tables | **Markor** — open it from inside Markor's own file browser, not "Open with" |
| Playing with sound and music | **Chrome** (or Firefox, Samsung Internet, Edge) |
| Best, once published | **Install it** to the home screen — own icon, own window, full sound, works with no signal |

Markor is a text editor; its preview cannot play audio. That is a limit of Markor, not of these files.