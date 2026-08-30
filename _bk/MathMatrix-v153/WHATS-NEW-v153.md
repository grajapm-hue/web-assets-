# 📋 What changed since your v1.31 copy

Your earlier personal copy was **v131**, taken on 6 August 2026. This one is
**v153**, taken on 29 August 2026 — twenty-two published versions later.

This is the published history, newest first, exactly as it is recorded in the
live site's own repository.

## New puzzles and games

| Version | What arrived |
|---|---|
| **v153** | **Fill In The Blank** replaces Triangle Magic — a 3×3 grid of boxes joined by `+ − × ÷`, with the six answers fixed around the edge |
| v148 | **Thayam** (Dayakattai), the traditional cross-board race game |
| v146, v145 | **Pallanguzhi 4-player**, sowing and passing the turn anti-clockwise |
| v136 | **Sudoku**, four levels |
| v135 | **Slide Magic**, and a skip in Gate Logic |
| v133 | **Gate Logic** |

Triangle Magic was removed at v153. Your group found it was mind-mapping and
dragging rather than arithmetic, so Fill In The Blank took its place — it puts
the calculation back in front.

### About Fill In The Blank

- One card, not three levels in the list. The numbers **and** the signs are
  both chosen on the board itself.
- The nine numbers no longer have to be 1–9. Any run of nine consecutive
  numbers works, so the same puzzle carries multi-digit arithmetic.
- Every grid has **exactly one** arrangement that fits.
- The board reads **strictly left to right**: `8 − 6 × 2` is `4` here, not `−4`.
- At v153, every `+ − × ÷` sits on the centre line of the boxes it joins.

## Fixes and improvements

| Version | What was fixed |
|---|---|
| v152 | a finished line is only green when it is actually right — a filled-but-impossible line now reads red, not orange |
| v151 | the result ring around every grid |
| v150 | the iPhone notch no longer sits on the app bar |
| v149 | old installs can update themselves again |
| v148 | winning stops hiding your work |
| v147 | **every puzzle with a board now remembers an unfinished game** |
| v144 | the silent update survives a reconnect |
| v143 | Install App button on the opening screen |
| v142 | health caution notice for children, on the opening screen |
| v141 | a puzzle could stay stacked underneath the next one you opened |
| v139 | Share sends a link, so the copy button copies a link |
| v138 | the bottom bar cannot be pushed off the screen |
| v137 | the version badge is legible |
| v134 | the version footer no longer doubled the v — it read "vv133" |
| v132 | Install chip, and the version label actually moves |

Also in v153, carried over from the beta line: badges shrink to fit their own
text on every board; the keypad carries the board's own numbers and cannot
build one that is not there; warm-up cards shuffle properly; logic rooms
advance on their own; and the XNOR/XOR wording says what the rule actually is.

## What this means for the folder

The app itself is much bigger than it was: **147 kB at v131, 911 kB at v153**.
That is why the single-file publish copy has grown from 2.4 MB to 5.6 MB.

The arrangement is otherwise unchanged. The same two-copy idea applies, the
same `sw.js` / `sw-standalone.js` pairing applies, and everything in
`WORKFLOW.md` works the way it did before.

There are now **eleven** puzzles in the main list, and eight formula sheets.
Binary and binary2 have no formula sheet on purpose — they explain themselves
under "The method".
