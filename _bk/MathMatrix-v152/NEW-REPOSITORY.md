# 🌐 Publishing your own copy, from your own account

This puts a version of the game on the web at an address you own, without
touching any existing site and without needing anyone else.

Everything here is done in a **browser**. No command line, no tools.

## What you will end up with

An address like:

```
https://<your-github-username>.github.io/
```

It is free, it has no adverts, and it stays up on its own.

## Step 1 — a GitHub account

Go to **github.com** and sign up, if you do not already have the account you
want to publish from. A second account for a parallel version is perfectly
normal.

## Step 2 — make the repository

1. Click **+** (top right) → **New repository**
2. Name it **exactly** `<your-username>.github.io` — the name must match your
   username, or the address will not work
3. Set it to **Public**
4. Tick **Add a README file**
5. Click **Create repository**

## Step 3 — upload the game

Decide which arrangement you want first:

| Arrangement | Upload | Also upload |
|---|---|---|
| **Simple, one file** | `PUBLISH-THIS-MathMatrix-v152.html`, renamed to `index.html` | `sw-standalone.js` |
| **Same as the site today** | `EDIT-THIS-MathMatrix-v152.html`, renamed to `index.html` | `sw.js`, `manifest.json`, the 8 `cheat-*` files, `bgm-monkeys.mp3`, the 3 `icon-*` files |

The one-file arrangement is far easier and behaves identically. Use it unless
you have a reason not to.

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
   missed a `cheat-*` file.)*
3. Turn the sound on. Does the music play? *(If not, `bgm-monkeys.mp3` is
   missing — or you are on the one-file copy, where it cannot be missing.)*
4. In Chrome's menu, is **Add to Home screen** or **Install app** offered? If
   yes, the manifest and icons are right.
5. Turn on aeroplane mode, close the app, open it again. It should still play.
   *(This only works after the first successful visit — that is what the
   service worker is for.)*

## Step 6 — when you change something later

Upload the new file the same way, **and give `var BUILD_VER` inside it a new
number first**. Without a new version number, everyone who has already visited
keeps the old copy from their cache and will never see the change. This is the
single most common reason an update "did not work".

## A note on the two service workers

| If you published | Use | Because |
|---|---|---|
| the one-file copy | `sw-standalone.js` | it only has the page to look after |
| the multi-file copy | `sw.js` | it caches each picture by name |

Pairing the stock `sw.js` with the one-file copy makes it try to cache a
dozen files that do not exist. It fails to install, and you silently get no
offline play at all — the app still works online, so the fault is easy to miss.
