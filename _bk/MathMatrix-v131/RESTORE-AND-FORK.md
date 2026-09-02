# MathMatrix — v131 full backup

This is a complete, self-contained snapshot of **v131**, taken straight from git history (commit `f873daf` — "Wording precision: any numbers IN SEQUENCE on the additive cards (v131)", 2026-08-05 22:33:52 -0700).

v131 is the version currently serving **https://kidsmathsmatrixpuzzle.github.io**. It was chosen as the safe baseline because it sits *before* the day/night theme (added v132, removed v134) and before the v134 decoration layer, while still containing every feature that had been verified: the wording fixes, the spatial stereo audio, and the Ramanujan single-digit / negative-number input fixes.

## Why this backup exists

To freeze a known-good edition so that a **separate version for adults** can be built from it later, with a plainer, more professional look — while the kids edition carries on evolving at /beta and, when approved, at the live link.

Suggested split, if you go that way:

| Edition | Lives at | Look |
| --- | --- | --- |
| Kids | `/` and `/beta` | monkey mascot, clay depth, stars, confetti |
| Adults | e.g. `/pro/` | this v131 core, restrained type, no mascot, denser layout |

Both would share the same puzzle engine and the same verified mathematics, so a fix to the maths only has to be made once.

## What is in this folder

- `KidsMathsMatrixPuzzle.html` — 143,749 bytes
- `MultiplyMagic3.html` — 22,969 bytes
- `README.md` — 1 bytes
- `bgm-monkeys.mp3` — 481,443 bytes
- `cheat-10x10.png` — 196,571 bytes
- `cheat-3x3.png` — 153,682 bytes
- `cheat-4x4.png` — 152,171 bytes
- `cheat-5x5.png` — 187,243 bytes
- `cheat-6x6.png` — 134,257 bytes
- `cheat-8x8.png` — 176,170 bytes
- `cheat-ramanujan.jpg` — 41,966 bytes
- `icon-192.png` — 16,682 bytes
- `icon-512-maskable.png` — 42,868 bytes
- `icon-512.png` — 64,442 bytes
- `manifest.json` — 905 bytes
- `sound-lab.html` — 5,815 bytes
- `sw.js` — 2,484 bytes

## What v131 contains

- **9 puzzles**: 3x3, 4x4, 5x5, 6x6, 8x8, 10x10, 3cube, ramanujan, binary
- On-screen keypad: yes
- Spatial stereo audio: yes
- Background music: yes
- Share button: yes · Install button: yes
- Offline instructions: yes
- Show Math Logic + binary converter: yes / yes
- Ramanujan birthday square: yes
- Provenance note and tagline: yes / yes
- Day/night theme: no *(correct — it was added later and then removed)*
- Clay decoration layer: no *(correct — that arrived in v134)*

## How to run it

Open `KidsMathsMatrixPuzzle.html` in any browser. Everything works offline except the background music file, which must sit beside it (`bgm-monkeys.mp3`).

## How to put it back on the live site

The live site serves the game as **index.html**, not under its original name.

1. Rename `KidsMathsMatrixPuzzle.html` → `index.html`
2. Upload `index.html` and `sw.js` to the root of

   `KidsMathsMatrixPuzzle/kidsmathsmatrixpuzzle.github.io`

3. Wait about 30–90 seconds for GitHub Pages to rebuild, then hard-refresh

**Watch out:** if you change the HTML, bump **both** `BUILD_VER` in the HTML and `CACHE_VERSION` in `sw.js` and keep them equal — otherwise the service worker serves people a stale copy.

## How to start the adults' edition from this

1. Copy this folder to `pro/`
2. Rename the game to `index.html`
3. In `sw.js` change `CACHE_VERSION` to something like `mathmatrix-pro-v1` so the

   two editions never fight over the same cache

4. Give it its own `manifest.json` name/icons if it should install separately

The puzzle engine, the nine games and all the verified mathematics come with it.

## Integrity

SHA-256 of every file, so you can confirm nothing has been altered:

```
c63d74d44b8cff88b31f5ecc9701a8b8b8f9ed130a6636cb1d831982a7545a64  KidsMathsMatrixPuzzle.html
b30164dc064e196f471972a13b94d32249284da6835b4b1b5daba4202663ac51  MultiplyMagic3.html
01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b  README.md
968db0c520ae444658f6c2187908e223a8d624c99991be7500faa2182db3382a  bgm-monkeys.mp3
68168dfe3a14542e09cedec81c75c1f199456a2a2cd1c0159e4c6f51b031b954  cheat-10x10.png
c719d910d52c71298f9cd3d356e508585941b8d33f55438ce8dc27d05f9714de  cheat-3x3.png
9133ba6f7dfd74f8ac23af3b08447586ef1fb41194b2c296766b45f2f32a7765  cheat-4x4.png
ff791d3ea50f22257aef8a1712b613e3c2c7f75aaf424e8235b53872da5b9d53  cheat-5x5.png
96cb263249bcbd209d46dd6b982ebc54383ba3e5c251a2faf02122abec2f7f6a  cheat-6x6.png
58bcf3a6d0ea70f4ab0569ac92d7e49627869653c4362cb98f0a30b15662288b  cheat-8x8.png
9cc27ca445e7896353de93e7929e599803a3fb5a6947be941b0f01b79f68f71b  cheat-ramanujan.jpg
66b5211100273aed07249f4abb079e3fe566fafb02afcf49920f6f8b7a1a2da2  icon-192.png
b09b69294c64816c2e4f504ce169d80b9b80f7bd83e8088008bf7574c2075575  icon-512-maskable.png
ff824d139dba0e2258e8110196ff018cd4ce222c60af2ef558285811863574bc  icon-512.png
844e27b9a4dcb7d88ee985949c9a5bdd88d509c930af44accc2a5e343280b124  manifest.json
e4ce02e09df6d2b4f5759e5d923c9127907c5c62bae02b08e4c8ffd41bc7cc63  sound-lab.html
e25da9c62955cf4dc6fe0d2ea0c360d81622cbcd36feb8df967dca16d7b63978  sw.js
```

Verify on Windows with:

```
Get-FileHash .\KidsMathsMatrixPuzzle.html -Algorithm SHA256
```

---

Created by G. RajaPathamuthu · Kids Puzzle Library