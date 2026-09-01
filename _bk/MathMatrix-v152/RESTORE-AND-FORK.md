# 🛟 Putting v152 back, if something goes wrong

This folder is a complete, verified copy of the live site as it stood on
**1 September 2026**. If a later change breaks it, everything needed to undo that is
here.

## The site this came from

| | |
|---|---|
| Address | https://kidsmathsmatrixpuzzle.github.io/ |
| Repository | `KidsMathsMatrixPuzzle/kidsmathsmatrixpuzzle.github.io` |
| Version in this folder | **v152** |
| Page | `index.html` |

## Restoring by hand, in a browser

The whole site is the files in this folder. To put v152 back:

1. Open the repository on **github.com**
2. Click **Add file** → **Upload files**
3. Drag in **`index.html`** from this folder — the untouched original, not
   either of the renamed copies
4. If the pictures or the worker were also changed, drag those in too:
   `sw.js`, `manifest.json`, the 8 `cheat-*` files,
   `bgm-monkeys.mp3`, the 3 `icon-*` files
5. Commit

Uploading a file that already exists **replaces** it. That is what you want.

Wait two or three minutes, then open the site and confirm the version shown in
the app reads **v152** again.

## Restoring through the repository's own history

GitHub keeps every previous version, so you can often go back without uploading
anything:

1. Open the repository → **Commits**
2. Find the last commit that was good
3. Click the **`…`** beside it → **Revert**

This is cleaner than uploading, because it keeps the history honest about what
happened.

## Checking the site really went back

Do not trust the repository page alone — it shows what was committed, not what
is being served.

1. Open **https://kidsmathsmatrixpuzzle.github.io/** in a private/incognito window, so you are not shown your
   own cached copy
2. Check the version number the app displays
3. Open one puzzle and one formula sheet

A normal browser window can keep showing the old version for a while because of
the service worker. A private window will not.

## Forking: a parallel version that disturbs nothing

If you want to try something without any risk, do not edit this repository at
all. Publish a **second** copy from a different account and work there. Full
steps are in `NEW-REPOSITORY.md`.

The two are completely independent: different address, different repository,
different service worker cache. Nothing you do in one can reach the other.

## Proving these files are genuine

`SHA256SUMS.txt` holds a fingerprint of every file in this folder. On Windows:

```
certutil -hashfile index.html SHA256
```

If the answer matches the line in `SHA256SUMS.txt`, that file is byte-for-byte
what the site was serving on 1 September 2026. `check-backup-bundle.js`, kept with the
project, checks all of them at once and also confirms the editable copy is
identical to the published page.
