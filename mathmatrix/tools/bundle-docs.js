/* The papers that travel with a backup bundle.

   These are read on a phone, in Markor, by someone who does not have this
   repository, this machine, or this chat. So every number in them is measured
   from the files actually in the folder rather than typed by hand -- a size, a
   line number or a version that has quietly gone stale is worse than no number
   at all, because it is believed.

   Called by make-backup-bundle.js once the files are downloaded. */
const fs = require('fs');
const path = require('path');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

module.exports = function writeDocs(o) {
  const {
    OUT, VER, BETA, SITE, PAGE, MANIFEST, WORKER, EDIT, PUB, ASSETS,
  } = o;

  const read = f => fs.readFileSync(path.join(OUT, f), 'utf8');
  const kB = f => Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
  const MB = f => (fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(1);
  const longest = t => t.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
  const commas = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const editSrc = read(EDIT);
  const pubSrc = read(PUB);
  const editKB = kB(EDIT), pubMB = MB(PUB);
  const editLong = longest(editSrc), pubLong = longest(pubSrc);
  const editLines = editSrc.split('\n').length;

  const d = new Date();
  const DATE = d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();

  /* Line numbers are quoted so Raja can jump straight to a place in a 16,000
     line file. Measured, never remembered. */
  const lineOf = (re) => {
    const lines = editSrc.split('\n');
    for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
    return null;
  };
  const at = (re, what) => { const n = lineOf(re); return n ? `${what} (near line ${n})` : what; };
  const LN_TITLE = at(/<title>/, '`<title>`');
  const LN_PUZZLES = at(/var PUZZLES = \{/, '`var PUZZLES = {`');
  const LN_LANG = at(/var LANG =/, '`var LANG =`');
  const LN_BUILD = at(/var BUILD_VER =/, '`var BUILD_VER`');

  /* The puzzle list the app itself offers, read out of the page rather than
     remembered -- this is exactly the set that changes between versions. The
     buttons are built in JS, so the data-size values are the honest source. */
  const levels = [];
  for (const m of editSrc.matchAll(/data-size="([a-z0-9]+)"/g))
    if (!levels.includes(m[1])) levels.push(m[1]);
  const NICE = { '3cube': 'a 3-cube multiply square', ramanujan: 'a Ramanujan square',
    triangle: 'Triangle Magic', blanks: 'Fill In The Blank',
    binary: 'a binary puzzle', binary2: 'a second binary puzzle' };
  const nice = k => NICE[k] || k.replace(/^(\d+)x(\d+)$/, '$1×$2');
  const sheets = ASSETS.filter(a => /^cheat-/.test(a)).length;
  const nPuz = levels.length;

  const WHERE = BETA ? 'the beta preview' : 'the live site';
  const Where = BETA ? 'The beta preview' : 'The live site';
  const REPO = BETA ? '`grajapm-hue/web-assets-` (folder `mathmatrix/`)'
                    : '`KidsMathsMatrixPuzzle/kidsmathsmatrixpuzzle.github.io`';
  const buildVerLine = (editSrc.match(/var BUILD_VER = '[^']*'/) || [''])[0];

  /* The one difference that can silently cost offline play in the beta bundle:
     the beta registers its worker with a scope pinned to beta.html, so the
     multi-file arrangement only works if the page keeps that name. */
  const scopeWarning = BETA ? `

> **Beta only — keep the name \`${PAGE}\`.** This page registers its worker as
> \`${WORKER}\` with its scope pinned to \`./${PAGE}\`. If you rename the page to
> \`index.html\` and keep the loose files, the worker no longer covers the page
> and offline play stops working without any error message. Either keep the
> page named \`${PAGE}\` and visit \`/${PAGE}\`, or use the one-file copy — the
> single-file copy already had that scope removed when it was built.
` : '';

  const whatsNew = fs.existsSync(path.join(OUT, `WHATS-NEW-${VER}.md`));

  const docs = {};

  /* ------------------------------------------------------------------ */
  docs['README.md'] = `# MathMatrix Pro++ — ${VER} personal backup

A complete copy of ${WHERE} as it stood on **${DATE}**, with everything
needed to read it, edit it, publish it, or put it back.

**Start with [\`START-HERE.md\`](START-HERE.md).**

| If you want to | Read |
|---|---|
| understand what is in this folder | [\`START-HERE.md\`](START-HERE.md) |
| carry on with a **different Claude account** | [\`CONTINUE-WITH-CLAUDE.md\`](CONTINUE-WITH-CLAUDE.md) |
| edit, check and publish | [\`WORKFLOW.md\`](WORKFLOW.md) |
| rename it for another audience | [\`EDIT-THE-WORDS.md\`](EDIT-THE-WORDS.md) |
| publish your own parallel copy | [\`NEW-REPOSITORY.md\`](NEW-REPOSITORY.md) |
| put this version back if something goes wrong | [\`RESTORE-AND-FORK.md\`](RESTORE-AND-FORK.md) |${whatsNew ? `
| see what this version is | [\`WHATS-NEW-${VER}.md\`](WHATS-NEW-${VER}.md) |` : ''}

## The two copies

- **\`${EDIT}\`** — ${editKB} kB. The one to work on. Opens fine in Markor.
- **\`${PUB}\`** — ${pubMB} MB. Everything folded inside one
  file. Works from a folder with no signal, nothing beside it.

Never try to edit the publish copy on a phone: it holds a single line of
${commas(pubLong)} characters.

## Verified, not assumed

The publish copy was copied alone into an empty folder, opened with the network
switched off at the browser, and played from there. All ${nPuz} puzzles opened,
all ${sheets} formula sheets drew their own picture from inside the file, and it
never made a single request to the web.

\`SHA256SUMS.txt\` fingerprints every file here.

${Where}: ${SITE}
`;

  /* ------------------------------------------------------------------ */
  docs['START-HERE.md'] = `# 📁 MathMatrix Pro++ **${VER}** — your personal copy

Taken from ${WHERE} on **${DATE}**.

Keep this folder wherever you like. Nothing in it talks to the internet, nothing
in it can be changed by anyone else, and nothing in it needs my machine, this
chat, or any remote connection. It is complete on its own.

> If you want to carry on working with a **different Claude account**, with no
> dependence on the current setup, read **\`CONTINUE-WITH-CLAUDE.md\`**. It has a
> ready-made opening message to paste.

## The two copies of the game

| File | Size | Use it for |
|---|---|---|
| **\`${EDIT}\`** | ${editKB} kB | ⭐ reading and editing. Opens fine in Markor. |
| **\`${PUB}\`** | ${pubMB} MB | playing anywhere, and uploading to a site. One file, nothing beside it. |
| \`${PAGE}\` | ${editKB} kB | the published page, untouched — a true record. Leave it alone. |

Both copies are the same game. The difference is only where the pictures and
the music are kept.

- **EDIT** keeps them as separate files beside it. Longest line **${commas(editLong)}
  characters**, so a phone editor opens it instantly.
- **PUBLISH** keeps them *inside* the page as text. That is what makes it work
  from a folder with no signal — but it contains a single line of **${commas(pubLong)}
  characters**, which is why a phone editor shows a blank screen on it.

**So: edit the EDIT one, publish the PUBLISH one.** Never try to edit the
publish copy on a phone.

## What is in the folder

| File | What it is |
|---|---|
| \`${EDIT}\` | ⭐ the one to work on |
| \`${PUB}\` | the single-file copy for playing and publishing |
| \`sw-standalone.js\` | its partner **for publishing only** — this is what makes a published copy work with no signal |
| \`${PAGE}\`, \`${WORKER}\`, \`${MANIFEST}\` | the published files, exactly as served |
| the ${sheets} \`cheat-*\` pictures | the formula sheets, as loose files (already inside the publish copy) |
| \`bgm-monkeys.mp3\` | the music (already inside the publish copy) |
| \`icon-192/512/512-maskable.png\` | the home-screen icons |
| \`MultiplyMagic3.html\`, \`sound-lab.html\`, \`design-preview.html\` | the side pages on the same site |
| \`START-HERE.md\` | this page |
| \`CONTINUE-WITH-CLAUDE.md\` | how to carry on from a **separate Claude account** |
| \`WORKFLOW.md\` | the edit → check → publish loop |
| \`EDIT-THE-WORDS.md\` | how to rename it for a different audience |
| \`NEW-REPOSITORY.md\` | how to publish a parallel version from a second account |
| \`RESTORE-AND-FORK.md\` | how to put ${VER} back if something goes wrong |
| \`SHA256SUMS.txt\` | fingerprints, to prove nothing has been altered |

## Opening it on your phone

**To read or edit** — open \`${EDIT}\` in **Markor**, from
inside Markor's own file browser (not "Open with").

**To play** — open \`${PUB}\` in **Chrome**. Because
everything is inside that one file, you can move it, rename it, mail it to
yourself or drop it in Google Drive and it still works. No other file has to
travel with it.

## What works from a folder, and what does not

| | From a folder | From a web address |
|---|---|---|
| All ${nPuz} puzzles | ✅ | ✅ |
| Formula sheet pictures | ✅ | ✅ |
| Sounds and music | ✅ | ✅ |
| Works with no internet | ✅ | ✅ (after first visit) |
| **Add to Home Screen / install** | ❌ | ✅ |

**Why install does not work from a folder.** Phones only allow an app to be
installed from a real web address (\`https://…\`), never from a file sitting in
your storage. That is the phone's rule, not something in this code.

**Nothing has to be added later.** The app name and all three home-screen icons
are already built into the publish copy, and \`sw-standalone.js\` is already
written and tested. The day you decide to publish, you upload those two files
and installing works immediately.

## This was tested, not assumed

The publish copy was copied **alone into an empty folder**, opened with the
**network switched off at the browser**, and played from there:

- all ${nPuz} puzzles opened and were playable
- all ${sheets} formula sheets drew their own picture, from inside the file
- the music is inside the file, with no filename left to fetch
- **it never reached for anything on the web** — not one request

The check that proves this is \`check-backup-bundle.js\`, kept with the project.
`;

  /* ------------------------------------------------------------------ */
  docs['WORKFLOW.md'] = `# 🔁 Two files, two jobs

You have one file for **editing** and one for **publishing**. They hold the
same game. Use each for what it is good at.

| File | Size | Longest line | Use it for |
|---|---|---|---|
| **\`${EDIT}\`** | ${editKB} kB | ${commas(editLong)} | changing words, tips, puzzle tables |
| **\`${PUB}\`** | ${pubMB} MB | ${commas(pubLong)} | playing anywhere, and uploading to a site |
| \`${PAGE}\` | ${editKB} kB | ${commas(editLong)} | the untouched original — leave it alone |

## Why two

The publish copy has the music, the ${sheets} formula sheets and the icons written
inside it as text. That makes one file that works anywhere, with no signal and
nothing beside it — but that single ${commas(pubLong)}-character line is why a phone
editor shows a blank screen when you try to open it.

The edit copy keeps those as separate files beside it. Its longest line is ${commas(editLong)}
characters, so it opens instantly and behaves normally in Markor.

## The loop

1. **Edit** \`${EDIT}\` in Markor — or ask Claude to, see
   \`CONTINUE-WITH-CLAUDE.md\`.
2. **Check it** by opening that same file in Chrome, from the same folder.
   Everything works, including the formula sheets and the music, **as long as
   the loose \`cheat-*\` pictures and \`bgm-monkeys.mp3\` are in that folder** —
   they are, in this bundle.
3. **Change the version.** Find ${LN_BUILD} near the bottom and give it a new
   number, or returning visitors keep the old copy from their cache.
4. **Rebuild the publish copy** — the single-file version with everything
   folded back in. Claude can do this, or publish the simple way below.
5. **Publish** the new publish copy as \`index.html\`, together with
   \`sw-standalone.js\`. See \`NEW-REPOSITORY.md\`.

## If you only want to publish the simple way

You do not have to rebuild the single-file copy at all. You can publish the
**edit copy** and upload the loose picture files beside it — that is exactly how
the site is arranged today. Use \`${WORKER}\`, not \`sw-standalone.js\`, for that
arrangement.

| You publish | Upload beside it | Service worker to use |
|---|---|---|
| the **edit** copy | the ${sheets} \`cheat-*\` files, \`bgm-monkeys.mp3\`, the 3 icons, \`${MANIFEST}\` | \`${WORKER}\` |
| the **publish** copy | nothing | \`sw-standalone.js\` |

Getting this pair wrong is the one mistake that matters: the stock \`${WORKER}\`
caches a dozen files **by name**, so pairing it with the single-file copy makes
it fail to install, and you silently get no offline play at all.
${scopeWarning}
## Adding a new puzzle

Find ${LN_PUZZLES}. Each entry is one puzzle: its size, its
tips, and the worked example the Watch demo plays back. To add one, copy a whole
entry, change its key and its numbers, then add a matching button in the
difficulty list (search for \`data-size=\`).

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
`;

  /* ------------------------------------------------------------------ */
  docs['EDIT-THE-WORDS.md'] = `# ✏️ Renaming it for a different audience

Everything below is a **wording** change. None of it touches the puzzles or the
arithmetic, so none of it can break the game. Work in
\`${EDIT}\`.

## The name appears in four places

Change all four, or the app will disagree with itself.

| Where | Search for | What it does |
|---|---|---|
| the browser tab | ${LN_TITLE} | the name on the tab and in a bookmark |
| the page itself | \`MathMatrix Pro++\` | the name the child reads on screen |
| the installed app | \`"name"\` in \`${MANIFEST}\` | the name under the home-screen icon |
| the short label | \`"short_name"\` in \`${MANIFEST}\` | used when the full name will not fit |

Keep \`short_name\` under about 12 characters or Android trims it with no
warning.

If you are publishing the **single-file** copy, the manifest is folded inside
the page instead — search for \`application/manifest+json\` and you will find it
as one long block of letters. That one cannot be edited by hand. Change
\`${MANIFEST}\` and have the single-file copy rebuilt from it.

## Changing what the app says to the child

The tips and the wording for each puzzle live in ${LN_PUZZLES}. Each entry has
its own text. Change the words inside the quotes and leave the punctuation
around them alone.

The mascot's line at the top of a puzzle, the hint text, and the messages when
a child wins are all plain sentences in quotes. They can be reworded freely.

## For a different age group

| Change | Where | Note |
|---|---|---|
| simpler wording | \`var PUZZLES\` tips | keep sentences short; they are read on a phone |
| a different language | every quoted string | the app already has a language switch — see ${LN_LANG} before starting a translation by hand |
| remove a puzzle from the list | search \`data-size=\` | hides the button. The puzzle's code stays, harmless. |

**Do not delete a puzzle's entry from \`var PUZZLES\`** while its button still
exists — the button will open a blank screen. Remove the button first.

## Rules that must survive any rewording

1. Do not change numbers inside \`var PUZZLES\` while editing words. Those are
   checked squares; a stray digit makes a puzzle unsolvable.
2. Do not remove \`var BUILD_VER\`. The app uses it to notice a new version.
3. Keep the quotes and commas exactly as they are. A missing comma in
   JavaScript stops the whole page, and the screen goes blank with no message.

## After editing

1. Open the file in Chrome from the same folder and click through every puzzle
   you touched.
2. If the screen is blank, you have a punctuation mistake. Press **F12**, look
   at the Console tab, and it will name the line.
3. Give \`var BUILD_VER\` a new number before publishing.
`;

  /* ------------------------------------------------------------------ */
  docs['RESTORE-AND-FORK.md'] = `# 🛟 Putting ${VER} back, if something goes wrong

This folder is a complete, verified copy of ${WHERE} as it stood on
**${DATE}**. If a later change breaks it, everything needed to undo that is
here.
${BETA ? `
> **This is the beta preview, not the live site.** Nothing in this folder can
> change what children are playing at
> https://kidsmathsmatrixpuzzle.github.io/ — that is a different repository
> with its own files. Restoring here restores the preview only.
` : ''}
## The site this came from

| | |
|---|---|
| Address | ${SITE} |
| Repository | ${REPO} |
| Version in this folder | **${VER}** |
| Page | \`${PAGE}\` |

## Restoring by hand, in a browser

The whole site is the files in this folder. To put ${VER} back:

1. Open the repository on **github.com**
2. Click **Add file** → **Upload files**
3. Drag in **\`${PAGE}\`** from this folder — the untouched original, not
   either of the renamed copies
4. If the pictures or the worker were also changed, drag those in too:
   \`${WORKER}\`, \`${MANIFEST}\`, the ${sheets} \`cheat-*\` files,
   \`bgm-monkeys.mp3\`, the 3 \`icon-*\` files
5. Commit

Uploading a file that already exists **replaces** it. That is what you want.

Wait two or three minutes, then open the site and confirm the version shown in
the app reads **${VER}** again.

## Restoring through the repository's own history

GitHub keeps every previous version, so you can often go back without uploading
anything:

1. Open the repository → **Commits**
2. Find the last commit that was good
3. Click the **\`…\`** beside it → **Revert**

This is cleaner than uploading, because it keeps the history honest about what
happened.

## Checking the site really went back

Do not trust the repository page alone — it shows what was committed, not what
is being served.

1. Open **${SITE}** in a private/incognito window, so you are not shown your
   own cached copy
2. Check the version number the app displays
3. Open one puzzle and one formula sheet

A normal browser window can keep showing the old version for a while because of
the service worker. A private window will not.

## Forking: a parallel version that disturbs nothing

If you want to try something without any risk, do not edit this repository at
all. Publish a **second** copy from a different account and work there. Full
steps are in \`NEW-REPOSITORY.md\`.

The two are completely independent: different address, different repository,
different service worker cache. Nothing you do in one can reach the other.

## Proving these files are genuine

\`SHA256SUMS.txt\` holds a fingerprint of every file in this folder. On Windows:

\`\`\`
certutil -hashfile ${PAGE} SHA256
\`\`\`

If the answer matches the line in \`SHA256SUMS.txt\`, that file is byte-for-byte
what the site was serving on ${DATE}. \`check-backup-bundle.js\`, kept with the
project, checks all of them at once and also confirms the editable copy is
identical to the published page.
`;

  /* ------------------------------------------------------------------ */
  docs['NEW-REPOSITORY.md'] = `# 🌐 Publishing your own copy, from your own account

This puts a version of the game on the web at an address you own, without
touching any existing site and without needing anyone else.

Everything here is done in a **browser**. No command line, no tools.

## What you will end up with

An address like:

\`\`\`
https://<your-github-username>.github.io/
\`\`\`

It is free, it has no adverts, and it stays up on its own.

## Step 1 — a GitHub account

Go to **github.com** and sign up, if you do not already have the account you
want to publish from. A second account for a parallel version is perfectly
normal.

## Step 2 — make the repository

1. Click **+** (top right) → **New repository**
2. Name it **exactly** \`<your-username>.github.io\` — the name must match your
   username, or the address will not work
3. Set it to **Public**
4. Tick **Add a README file**
5. Click **Create repository**

## Step 3 — upload the game

Decide which arrangement you want first:

| Arrangement | Upload | Also upload |
|---|---|---|
| **Simple, one file** | \`${PUB}\`, renamed to \`index.html\` | \`sw-standalone.js\` |
| **Same as the site today** | \`${EDIT}\`, renamed to \`${BETA ? PAGE : 'index.html'}\` | \`${WORKER}\`, \`${MANIFEST}\`, the ${sheets} \`cheat-*\` files, \`bgm-monkeys.mp3\`, the 3 \`icon-*\` files |

The one-file arrangement is far easier and behaves identically. Use it unless
you have a reason not to.
${scopeWarning}
To upload:

1. In your new repository, click **Add file** → **Upload files**
2. Drag the files in
3. **Rename the game file** as the table above says — click the file name after
   it uploads, or rename it on your computer before dragging
4. Type a short note in the box at the bottom
5. Click **Commit changes**

## Step 4 — turn on the website

1. Click **Settings** (in the repository, not your account)
2. Click **Pages** in the left-hand list
3. Under **Source**, choose **Deploy from a branch**
4. Branch: **main**, folder: **/ (root)**
5. Click **Save**

Wait two or three minutes. The page will show your address at the top.

## Step 5 — check it properly

Open the address on your phone, not just the computer.

1. Does the game load?
2. Open a puzzle, then open its **💡 Logic → Quick formula sheet**. Does the
   picture appear? *(If it does not, you used the multi-file arrangement and
   missed a \`cheat-*\` file.)*
3. Turn the sound on. Does the music play? *(If not, \`bgm-monkeys.mp3\` is
   missing — or you are on the one-file copy, where it cannot be missing.)*
4. In Chrome's menu, is **Add to Home screen** or **Install app** offered? If
   yes, the manifest and icons are right.
5. Turn on aeroplane mode, close the app, open it again. It should still play.
   *(This only works after the first successful visit — that is what the
   service worker is for.)*

## Step 6 — when you change something later

Upload the new file the same way, **and give \`var BUILD_VER\` inside it a new
number first**. Without a new version number, everyone who has already visited
keeps the old copy from their cache and will never see the change. This is the
single most common reason an update "did not work".

## A note on the two service workers

| If you published | Use | Because |
|---|---|---|
| the one-file copy | \`sw-standalone.js\` | it only has the page to look after |
| the multi-file copy | \`${WORKER}\` | it caches each picture by name |

Pairing the stock \`${WORKER}\` with the one-file copy makes it try to cache a
dozen files that do not exist. It fails to install, and you silently get no
offline play at all — the app still works online, so the fault is easy to miss.
`;

  /* ------------------------------------------------------------------ */
  docs['CONTINUE-WITH-CLAUDE.md'] = `# 🤖 Carrying on with a **different Claude account**

This folder is deliberately self-contained. To keep working on the game you do
**not** need:

- this chat, or anything said in it
- my machine, or anything installed on it
- remote control, screen sharing, or any live connection between us
- the \`grajapm-hue/web-assets-\` working repository

Everything needed is in this folder. Copy it to any computer or phone, open a
**new chat on your own Claude account**, and carry on.

---

## The short version

1. Open a new chat at **claude.ai** (or Claude Code, if you have it on a PC).
2. Attach **\`${EDIT}\`**, plus this file and \`WORKFLOW.md\`.
3. Paste the opening message below.
4. Work as normal. When you are happy, publish by hand — see
   \`NEW-REPOSITORY.md\`. No one else has to be involved.

---

## The opening message to paste

Copy everything between the lines.

---

> I am working on a single-file HTML game called **MathMatrix Pro++**, version
> **${VER}**. I have attached the file. It is the whole app: HTML, CSS and
> JavaScript in one document, with no build step, no npm, no framework and no
> server. It is opened directly in a browser, and it is published by uploading
> that one file to GitHub Pages as \`index.html\`.
>
> It is a magic-square and logic puzzle game for children. Its ${nPuz} puzzles are
> ${levels.map(nice).join(', ')}.
> Their internal keys, used as \`data-size\`, are \`${levels.join('`, `')}\`.
> There are also card games (Pallanguzhi, Thayam) and a logic-gates section.
>
> **House rules for this codebase — please follow them:**
>
> 1. **Plain ES5 JavaScript.** \`var\` and \`function\`, not \`let\`/\`const\`/arrow
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
> 5. **Bump the version.** There is \`${buildVerLine.slice(0, 60)}${buildVerLine.length > 60 ? '…' : ''}\`
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
| Adding or fixing a puzzle | **claude.ai chat** | Attach the file, or paste the \`var PUZZLES = {\` block. |
| Big changes across the whole file | **Claude Code on a PC** | It can open, edit and re-open the file itself. |
| Checking the app really works | **Claude Code on a PC** | Only it can drive a real browser and see the result. |

**A warning about attaching the whole file.** \`${EDIT}\`
is ${editKB} kB and about ${commas(editLines)} lines. A chat may refuse it or lose the middle
of it. For most jobs it is better to paste only the part you are changing:

| To change | Search for |
|---|---|
| the app name in the browser tab | ${LN_TITLE} |
| the puzzles, their tips and worked examples | ${LN_PUZZLES} |
| the formula-sheet pictures | \`var CHEAT = {\` |
| the version number | ${LN_BUILD} |

**Never attach \`PUBLISH-THIS-…html\` to a chat.** It has a single line of
${commas(pubLong)} characters. It will be truncated, and anything built from a
truncated copy is broken in ways that are hard to see.

## Publishing without anyone's help

Full steps are in \`NEW-REPOSITORY.md\`. The short form:

1. Go to your repository on **github.com** in a browser.
2. Upload your edited file, renaming it to **\`index.html\`**.
3. Upload **\`sw-standalone.js\`** beside it, if you are publishing the
   single-file copy.
4. Commit. Wait a minute or two, then open the site and check the version
   number shown in the app matches what you published.

That is the whole publish. No command line, no tools, no other person.

## Proving nothing has been tampered with

\`SHA256SUMS.txt\` holds a fingerprint of every file. On a PC:

\`\`\`
certutil -hashfile ${EDIT} SHA256
\`\`\`

Compare the answer to the line in \`SHA256SUMS.txt\`. If they match, the file is
exactly the one that came out of ${WHERE} on ${DATE}.
`;

  for (const name of Object.keys(docs))
    fs.writeFileSync(path.join(OUT, name), docs[name], 'utf8');

  return { count: Object.keys(docs).length, editKB, pubMB, editLong, pubLong, levels, sheets };
};
