# Thayam (Dayakattai) — Design Spec

Status: **design agreed in discussion, layout mocked up, not yet built.**
Everything below is what has been confirmed across this design conversation with Raja. Nothing here is implemented in `beta.html` yet.

---

## Part 1 — How to Play (the player-facing rules)

Thayam is a traditional Tamil race game for 2–4 players, played with two special dice on a cross-shaped board. Each player races their own pieces ("seeds") from home, around the board, and into the centre goal. This app's version keeps the real rules intact, with one deliberate softening: the dice are tuned so nobody gets stuck waiting too long for the roll they need.

### The board
- Two sizes, offered as two separate tiles (the same way 2-player and 4-player Pallanguzhi are two tiles): a smaller **5×5** board and a fuller **7×7** board.
- Both are cross-shaped: an outer ring running all the way round the edge, then a smaller ring inside it (and a second, even smaller ring inside *that*, on the 7×7 board only), spiralling in to a single centre goal square.
- 9 squares on the board are marked with a **✕** — these are **Mount** squares, safe zones. A piece standing on a Mount can never be captured, no matter whose turn it is.
- Each colour has its own entry gate — one of the Mount squares, at the middle of that colour's own edge of the board.
- Every player owns **3 pieces** on the 5×5 board, or **5 pieces** on the 7×7 board.

### Players and setup
- 2, 3, or 4 players, chosen by ticking which colours are in the game (the same tick-box + "Choose Player" pattern the 4-player Pallanguzhi board already uses).
- Each player's own area ("Store") sits on their own side of the board — top, right, bottom, left — the same as sitting around a real table. Each Store shows that player's dice, their Roll button, and three counts: how many pieces are still waiting at home, how many are out on the board right now, and how many have already finished.

### Taking a turn
1. Roll the two dice.
2. To bring a piece out of your home for the first time, you need to roll a **Thayam** exactly (this app's dice are tuned so you're never stuck waiting more than a handful of rolls for one — see the note on softening below).
3. Certain rolls (a Thayam, a 5, a 6, or a 12) give you another roll straight after. Every roll — the first one and each bonus one — is independent: you freely choose which of your own pieces to apply it to, any piece you own, whether it's still waiting at home or already out on the board anywhere. A bonus chain is not locked onto the piece you happened to move first.
4. Move your piece(s) forward around the board.

### Capturing
- If your piece lands on a square already holding an opponent's piece — and that square is **not** a Mount — you capture it. It goes straight back to its own owner's home, to start its journey over.
- The same can happen to you. Nobody is protected outside a Mount square.

### The one rule that decides the pace of the game
- You cannot move any of your pieces off the outer ring and into the smaller ring toward the centre **until you have captured at least one opponent's piece**.
- Until then, your pieces just keep circling the outer ring on your normal rolls — never trapped, never unable to move, just capped at that one boundary.
- And because you're not standing on a Mount out there, you're exposed the whole time: any other player can capture you while you're waiting for your own first capture. The same risk applies to everyone who hasn't cut yet — it's what keeps every game tense, not just the leader's game.

### Reaching the centre
- Getting a piece into the very centre needs an exact roll, same as getting a piece out of home.
- Once a piece reaches the centre, it's done — it moves off the board into your own Store as a finished piece.
- First player to get every one of their pieces into the centre wins.

### When there's genuinely nothing to play
Sometimes a roll simply can't be used by any of your pieces — all of them are already finished, or still waiting on a Thayam, or the one piece left needs an exact number this roll didn't give. When that happens, the turn passes to the next player automatically, with a short message naming who's up — there's no Skip button to tap. Working out "do I actually have a move?" is real arithmetic across every piece you own, and asking a child to do that themselves, correctly, before they're even allowed to pass, would undo the whole point of softening the harder parts of this game. (Gate Logic elsewhere in this app has its own Skip button, but that's a *voluntary* skip with a real choice behind it — this is a forced dead turn, not a choice, so it isn't reused here.)

### Keeping the game moving (the one place this app softens the real rules)
The real game's dice can be genuinely unlucky — going many rolls without the exact number you need is part of the traditional game, but it can turn into a long, frustrating wait, especially for a child playing with family. This app keeps every rule exactly as it is, but tunes the dice so nobody is stuck too long at any of the three points where the real game can stall:
- rolling the Thayam needed to leave home,
- rolling the exact number needed to enter the centre,
- and capturing an opponent so you can leave the outer ring.

If a player goes 5–10 rolls without what they need at any of these three points, their next roll is guaranteed to give it to them. The rules themselves never change — only the odds of getting unstuck do.

---

## Part 2 — Behind the code (how this gets built)

Three genuinely hard problems were identified before any of this was designed, and each one reuses a pattern this app already has proven, rather than inventing something new.

### 1. Tracking where a piece is on the board
**Approach**: one shared ring array per lap-level (outer ring, middle ring, and — on the 7×7 board only — an inner ring), the same way Pallanguzhi's own `nextLiveCup()` already works: a single ring, with each colour just entering it at a different point. A piece's state is `{ lap, position }` plus a fixed per-colour offset used when reading the shared array.

The "can't pivot inward without a capture" rule falls straight out of this: advancing `lap` is simply refused until that player's `hasCut` flag is true — the piece keeps moving around the *current* ring on ordinary rolls, it just can't cross into the next one. No separate rule needs to be written for "stuck circling the outer ring" — it's the natural result of capping one field.

### 2. Capturing, and sending a piece back to its own home
**Approach**: no separate board-occupancy map to keep in sync. On every move, scan the (small — at most ~20 across a full 4-player 7×7 game) list of pieces directly for anyone else sitting on the landed-on cell. If found, and the cell isn't a Mount, reset that piece to `home`. A full scan costs nothing at this scale, and it's one less thing that can ever drift out of sync with the real board state.

### 3. Locking a piece in as won
**Approach**: once a piece reaches the centre, it's marked `finished` and **moves off the board entirely into that player's own Store panel** — the same panel already built for pieces waiting to start, now doing double duty as a trophy tray. Stacking up to 20 finished pieces from 4 different colours into one small board cell would be unreadable on a phone; moving them into each player's own space keeps it legible. This is where the "🏆 Win" count in each Store's three-way tally comes from.

### No legal move
After every roll, check whether any of the current player's pieces can actually use it (a home piece needs the roll to be exactly a Thayam; an on-board piece just needs to not overshoot centre). If none can, auto-pass the turn with a short flash naming the next player — no Skip button, since this is a forced dead turn rather than a voluntary choice. Cheap to check, for the same reason capture-scanning is cheap: at most a handful of pieces per player.

### Everything else, in short
- **Dice + pity system**: a per-player counter of "rolls since the last natural hit" at each of the three chokepoints; once it crosses a random threshold between 5 and 10, the next roll is forced to be the one they need.
- **Turn order and piece direction**: both run anti-clockwise, reusing the exact convention already fixed for 4-player Pallanguzhi this session (A → D → C → B) rather than inventing a separate one.
- **Turn indicator**: the mascot sits in the centre goal square, always upright, with a small arrow that rotates to point at whichever Store's turn it is — built directly on Pallanguzhi 4-player's own `.pal4Look` pattern, not a new mechanism.
- **Player selection**: the tick-box "Choose Player" row, re-skinned to Thayam's own colours but otherwise identical to Pallanguzhi 4-player's `.pal4Select` / `.pal4Tick` / `.pal4Choose`.
- **Save/resume**: given every other board puzzle in this app now remembers an unfinished game (shipped this session), Thayam should get the same treatment from the start rather than added later — saved per board size and per level, the same shape as the other puzzles' saves.

### What's still open
- The exact 7×7 middle/inner ring split (the reference images show a spiral inward; the exact cell sequence for that inner pivot hasn't been pinned down to the same certainty as the 5×5 board yet).
- Team play (2v2) — the reference material mentions it as an option but it hasn't been discussed here at all; treating it as a later addition unless you want it in the first build.
- Exact colour/name choices for the four players (Amber/Blue/Green/Yellow were placeholders in the mockups, not a final decision).
