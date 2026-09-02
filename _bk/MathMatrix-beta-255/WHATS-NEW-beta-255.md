# 📋 What this version is

**beta-255**, the preview site — reverted to match the live game exactly.

> This is **not** the live site. Nothing in this folder can change what children are playing at https://kidsmathsmatrixpuzzle.github.io/. That is a separate repository with its own files.

## The short answer: Fill In The Blank is gone

The beta had run ahead of the live game, as far as beta-264, and most of that distance was the Fill In The Blank puzzle. It has been taken out completely — the words appear **zero times** in this page — and Triangle Magic is back.

The two trial pages that were built alongside it were deleted too, so nothing is left half-wired behind a URL.

## This is the same game as v152

Not "similar to" — the same. Put through the publishing step, this page produces the live `index.html` byte for byte. That was checked by building it and comparing fingerprints, not by reading the code.

What genuinely differs is only the plumbing that makes a preview a preview:

|  | Live | This preview |
| --- | --- | --- |
| The page | `index.html` | `beta.html` |
| Its worker | `sw.js` | `beta-sw.js` |
| Its manifest | `manifest.json` | `beta-manifest.json` |
| Version badge | `v152` | `beta-255` |
| Offline cache name | `mathmatrix-v152` | `mathmatrix-beta-v255` |

`var BUILD_VER` here also carries a sentence of release notes after the number. Anything reading the version must take the **first word** — the rest is prose.

## The puzzles in this version

Eleven, the same set the live game has:

|  |  |
| --- | --- |
| Magic squares | 3×3, 4×4, 5×5, 6×6, 8×8, 10×10 |
| Multiply square | 3-cube (magic by **product**, not sum) |
| Named square | Ramanujan |
| Shapes | Triangle Magic |
| Binary | two puzzles |

Plus Pallanguzhi (including 4-player), Thayam, Sudoku, Gate Logic and Slide Magic — all unchanged by the revert.

## Proving this is really the preview page

The untouched `beta.html` in this folder has the Git fingerprint

```
84ee4f665cff12685afbdeef102b643c52a0bdef
```

which is the exact object on the preview repository's `main` branch, and the exact bytes the preview site is serving. `SHA256SUMS.txt` covers every other file in the folder.

## One thing to watch when republishing

This page registers its worker with the scope pinned to `./beta.html`. If you rename the page to `index.html` and keep the loose files beside it, the worker stops covering the page and offline play quietly fails. Either keep the name `beta.html`, or publish the single-file copy — that one already had the scope removed when it was built. `WORKFLOW.md` says the same thing in context.

Preview site: https://grajapm-hue.github.io/web-assets-/mathmatrix/beta.html