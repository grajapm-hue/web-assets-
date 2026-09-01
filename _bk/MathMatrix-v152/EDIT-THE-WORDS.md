# ✏️ Renaming it for a different audience

Everything below is a **wording** change. None of it touches the puzzles or the
arithmetic, so none of it can break the game. Work in
`EDIT-THIS-MathMatrix-v152.html`.

## The name appears in four places

Change all four, or the app will disagree with itself.

| Where | Search for | What it does |
|---|---|---|
| the browser tab | `<title>` (near line 59) | the name on the tab and in a bookmark |
| the page itself | `MathMatrix Pro++` | the name the child reads on screen |
| the installed app | `"name"` in `manifest.json` | the name under the home-screen icon |
| the short label | `"short_name"` in `manifest.json` | used when the full name will not fit |

Keep `short_name` under about 12 characters or Android trims it with no
warning.

If you are publishing the **single-file** copy, the manifest is folded inside
the page instead — search for `application/manifest+json` and you will find it
as one long block of letters. That one cannot be edited by hand. Change
`manifest.json` and have the single-file copy rebuilt from it.

## Changing what the app says to the child

The tips and the wording for each puzzle live in `var PUZZLES = {` (near line 5092). Each entry has
its own text. Change the words inside the quotes and leave the punctuation
around them alone.

The mascot's line at the top of a puzzle, the hint text, and the messages when
a child wins are all plain sentences in quotes. They can be reworded freely.

## For a different age group

| Change | Where | Note |
|---|---|---|
| simpler wording | `var PUZZLES` tips | keep sentences short; they are read on a phone |
| a different language | every quoted string | the app already has a language switch — see `var LANG =` (near line 13509) before starting a translation by hand |
| remove a puzzle from the list | search `data-size=` | hides the button. The puzzle's code stays, harmless. |

**Do not delete a puzzle's entry from `var PUZZLES`** while its button still
exists — the button will open a blank screen. Remove the button first.

## Rules that must survive any rewording

1. Do not change numbers inside `var PUZZLES` while editing words. Those are
   checked squares; a stray digit makes a puzzle unsolvable.
2. Do not remove `var BUILD_VER`. The app uses it to notice a new version.
3. Keep the quotes and commas exactly as they are. A missing comma in
   JavaScript stops the whole page, and the screen goes blank with no message.

## After editing

1. Open the file in Chrome from the same folder and click through every puzzle
   you touched.
2. If the screen is blank, you have a punctuation mistake. Press **F12**, look
   at the Console tab, and it will name the line.
3. Give `var BUILD_VER` a new number before publishing.
