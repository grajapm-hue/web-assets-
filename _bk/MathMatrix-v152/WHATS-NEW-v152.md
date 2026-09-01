# 📋 What this version is

**v152**, the version the live site went back to. This folder is a copy of what
the site is actually serving, not of what anyone believes it is serving.

## The short answer: Fill In The Blank is gone

The puzzle that replaced Triangle Magic has been taken out completely. It is
not hidden, not disabled, not behind a flag — the words "Fill In The Blank"
appear **zero times** in this page, and Triangle Magic is back in the list.

That was the point of the change. The grid-filling puzzle was tedious to check
and hard to be sure about, so the whole line was removed rather than patched.

## The puzzles in this version

Eleven, in the order the app lists them:

| | |
|---|---|
| Magic squares | 3×3, 4×4, 5×5, 6×6, 8×8, 10×10 |
| Multiply square | 3-cube (magic by **product**, not sum) |
| Named square | Ramanujan |
| Shapes | Triangle Magic |
| Binary | two puzzles |

Eight of them carry a formula sheet. The two binary puzzles have none on
purpose — they explain themselves under "The method".

## The rest of the app

Unchanged by the revert, and all present here:

- **Pallanguzhi**, including the 4-player game
- **Thayam** (Dayakattai), the cross-board race game
- **Sudoku**, four levels
- **Gate Logic** and **Slide Magic**
- the warm-up picture cards, the Watch demo, and the language switch

## Proving this is really the live page

The untouched `index.html` in this folder has the Git fingerprint

```
c90b5aef6237ac72b6c7cd6d7e7a17e702863a6b
```

which is the exact object the live repository is serving. `SHA256SUMS.txt`
covers every other file in the folder.

## Its twin

There is a matching folder for **beta-255**, the preview site. It is the same
game: put through the publishing step, the beta page produces this page byte
for byte. The two bundles are kept separate so either can be transferred,
edited or restored without touching the other.

Live site: https://kidsmathsmatrixpuzzle.github.io/
