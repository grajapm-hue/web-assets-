# 🤖 Carrying on with a **different Claude account**

This folder is deliberately self-contained. To keep working on the game you do
**not** need:

- this chat, or anything said in it
- my machine, or anything installed on it
- remote control, screen sharing, or any live connection between us
- the `grajapm-hue/web-assets-` working repository

Everything needed is in this folder. Copy it to any computer or phone, open a
**new chat on your own Claude account**, and carry on.

---

## The short version

1. Open a new chat at **claude.ai** (or Claude Code, if you have it on a PC).
2. Attach **`EDIT-THIS-MathMatrix-beta-255.html`**, plus this file and `WORKFLOW.md`.
3. Paste the opening message below.
4. Work as normal. When you are happy, publish by hand — see
   `NEW-REPOSITORY.md`. No one else has to be involved.

---

## The opening message to paste

Copy everything between the lines.

---

> I am working on a single-file HTML game called **MathMatrix Pro++**, version
> **beta-255**. I have attached the file. It is the whole app: HTML, CSS and
> JavaScript in one document, with no build step, no npm, no framework and no
> server. It is opened directly in a browser, and it is published by uploading
> that one file to GitHub Pages as `index.html`.
>
> It is a magic-square and logic puzzle game for children. Its 11 puzzles are
> 3×3, 4×4, 5×5, 6×6, 8×8, 10×10, a 3-cube multiply square, Triangle Magic, a Ramanujan square, a binary puzzle, a second binary puzzle.
> Their internal keys, used as `data-size`, are `3x3`, `4x4`, `5x5`, `6x6`, `8x8`, `10x10`, `3cube`, `triangle`, `ramanujan`, `binary`, `binary2`.
> There are also card games (Pallanguzhi, Thayam) and a logic-gates section.
>
> **House rules for this codebase — please follow them:**
>
> 1. **Plain ES5 JavaScript.** `var` and `function`, not `let`/`const`/arrow
>    functions in the app code. Two-space indent. Each concern wrapped in its
>    own IIFE. Match the surrounding style exactly.
> 2. **No dependencies, no build step, no CDN.** Nothing may be fetched from
>    the internet at runtime. It must keep working from a folder with no signal.
> 3. **Never break a magic square.** If you touch a puzzle's numbers, verify
>    every row, every column and both diagonals reach the same total, and that
>    each number is used exactly once. For the multiply square, the check is by
>    product, not sum. Show me the arithmetic.
> 4. **Verify before telling me it works.** Do not say something is fixed
>    because the code looks right. Open the file in a browser and check the
>    actual behaviour. If you cannot run it, say so plainly rather than
>    guessing.
> 5. **Bump the version.** There is `var BUILD_VER = 'beta-255 (the warm-up picture cards are shu…`
>    near the bottom. Any change I am going to publish needs a new number, or
>    returning visitors keep the old cached copy.
> 6. Tell me plainly when something cannot be done, or when you are unsure.
>    Push back if you think I am asking for the wrong thing.
>
> **What I want to do now:** *(say what you want here)*

---

## Which Claude to use for which job

| Job | Best choice | Why |
|---|---|---|
| Changing words, titles, tips | **claude.ai chat** | Paste just the section. No upload limits to worry about. |
| Adding or fixing a puzzle | **claude.ai chat** | Attach the file, or paste the `var PUZZLES = {` block. |
| Big changes across the whole file | **Claude Code on a PC** | It can open, edit and re-open the file itself. |
| Checking the app really works | **Claude Code on a PC** | Only it can drive a real browser and see the result. |

**A warning about attaching the whole file.** `EDIT-THIS-MathMatrix-beta-255.html`
is 887 kB and about 15,631 lines. A chat may refuse it or lose the middle
of it. For most jobs it is better to paste only the part you are changing:

| To change | Search for |
|---|---|
| the app name in the browser tab | `<title>` (near line 59) |
| the puzzles, their tips and worked examples | `var PUZZLES = {` (near line 5093) |
| the formula-sheet pictures | `var CHEAT = {` |
| the version number | `var BUILD_VER` (near line 15393) |

**Never attach `PUBLISH-THIS-…html` to a chat.** It has a single line of
676,117 characters. It will be truncated, and anything built from a
truncated copy is broken in ways that are hard to see.

## Publishing without anyone's help

Full steps are in `NEW-REPOSITORY.md`. The short form:

1. Go to your repository on **github.com** in a browser.
2. Upload your edited file, renaming it to **`index.html`**.
3. Upload **`sw-standalone.js`** beside it, if you are publishing the
   single-file copy.
4. Commit. Wait a minute or two, then open the site and check the version
   number shown in the app matches what you published.

That is the whole publish. No command line, no tools, no other person.

## Proving nothing has been tampered with

`SHA256SUMS.txt` holds a fingerprint of every file. On a PC:

```
certutil -hashfile EDIT-THIS-MathMatrix-beta-255.html SHA256
```

Compare the answer to the line in `SHA256SUMS.txt`. If they match, the file is
exactly the one that came out of the beta preview on 1 September 2026.
