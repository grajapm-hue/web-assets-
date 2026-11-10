# MathMatrix Responsive Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Publish a professional, orientation-independent Beta for group review, preserving all existing games and leaving Main unchanged.

**Architecture:** Keep the static app and its game engines. Remove page counter-rotation at its sources; share a small presentation stylesheet and real-viewport sizing through the existing layout module. Each puzzle continues to own its geometry, input mapping, and state.

**Tech Stack:** Existing HTML, CSS, and JavaScript; Node 24 and browser validation on Windows. Use Playwright as temporary test tooling outside production dependencies, with installed Chrome and Playwright WebKit where available.

**Spec:** `docs/superpowers/specs/2026-11-09-mathmatrix-responsive-design.md`

## Global constraints

- Beta only: `grajapm-hue/web-assets-`, `mathmatrix/beta-app/`. Do not write to the Main repository or publish Main.
- Preserve all 12 current category books, their choices, direct links, gameplay, maze maps/checkpoints/collisions/story order/artwork, scores, and saved-data keys.
- Keep both Beta entrypoints byte-identical. Preserve manifest identity, start URL, and scope.
- Use the spec palette and system fonts; retain the monkey identity. No framework, UI library, remote font, analytics, or backend.
- Normal phone/category sizes must show all category books together; at exceptional short windows or enlarged text, scroll rather than clip or make text unreadable.
- Run builds and checks on Windows, not GitHub Actions. Automatic Pages publication after merge is the hosting deployment; do not dispatch a test workflow.
- Publish Beta only after all tasks pass. Main promotion waits for user/group review.

## Review focus

1. Rotating a running Watch must continue playback rather than cancel, restart, or duplicate it; exercised by Tasks 1 and 3.
2. A touch drag after rotation must follow the maze under the finger and obey the same collision rules; exercised by Task 3.
3. A short landscape viewport or open keyboard must leave navigation, inputs, and dialog Close reachable; exercised by Tasks 2 and 3.
4. Existing installed clients must update their cached presentation without losing saved data; exercised by Task 4.
5. ResizeObservers must settle after reflow, avoiding a loop, duplicate handlers, and idle layout churn; exercised by Tasks 2 and 4.

## Files and responsibilities

- Modify `mathmatrix/beta-app/beta.html` and duplicate `index.html`: remove initial/runtime portrait enforcement and obsolete frame rules; integrate the presentation; preserve game handlers.
- Modify `game-layout.js`: replace `portrait()` with real-viewport `syncViewport()`; retain coalesced fitting, `fitTic()`, Gate fitting, and `mathmatrixviewportchange` notifications.
- Modify `game-layout.css`: remove root/page/dialog counter-rotation and the desktop phone frame; adapt existing Gate/Tic sizing.
- Modify `category-chooser.css` and `category-chooser.js`: fit the 12 books and their existing options to the available width and height without root rotation assumptions.
- Create `responsive-ui.css`: shared palette, type scale, headers/actions/navigation/dialog appearance and page-specific responsive layout rules. Load after each page's existing styles; remove obsolete rotation/frame rules at their source rather than merely overriding them here.
- Modify the active standalone pages: `criss-cross.html`, `tic-tac-toe.html`, `tunnels-of-meta.html`, `cave-treasure-hunt.html`, `treasure-hunt-landscape-prototype/index.html`, `MultiplyMagic3.html`, and `sound-lab.html`.
- Modify `beta-manifest.json` and `beta-sw.js`: any orientation, stable Beta name, next in-app release/cache, and precached shared presentation assets.
- Create `mathmatrix/tools/check-beta-responsive.cjs`: one browser validation entrypoint with sections `orientation`, `shell`, `games`, `offline`, and `all`; keep evidence outside tracked application files.

The browser checker accepts `--root <checkout> --section <name> --browser chromium|webkit --report-dir <path>` and, for upgrade/performance comparison, `--baseline-root <old-checkout>`. It serves the actual app under `/mathmatrix/beta-app/`; assertions use rendered DOM and real browser input. `MM_PLAYWRIGHT_MODULE` may point to the temporary Windows tooling installation. Do not add test-only hooks to game engines.

The shared viewport contract is CSS variables `--mm-viewport-width` and `--mm-viewport-height` in pixels, an `mmLandscape` class derived from actual visible width/height, and the existing `mathmatrixviewportchange` event. Emit the event only when dimensions change; schedule layout work once per animation frame. Puzzle-facing internal variables such as `--ttt-board-size` retain their existing meaning.

## Task 1: Natural orientation throughout the app

**Files:** both entrypoints, `game-layout.js/css`, the active standalone pages, `beta-manifest.json`, and the browser checker.

**Interfaces:** consume existing game state and fitting functions without changing their rules. Produce `syncViewport(): void`, the viewport contract above, and `data-mm-page` markers `app`, `criss-cross`, `tic-tac-toe`, `tunnels`, `cave-maze`, `story-maze`, `multiply-magic`, and `sound-lab` for targeted presentation and route assertions.

- [ ] Capture the unchanged baseline on Windows: source commit, splash/category/puzzle screenshots, errors, viewport measurements, time to usable UI, and representative input responsiveness. Keep an immutable baseline checkout/archive for Task 4.
- [ ] Add orientation checks at 390x844 -> 844x390 -> 390x844 with touch enabled. For every active route assert the root/body are upright, have no `lockRotateCW/CCW` classes, and do not swap the physical viewport dimensions. Assert the manifest permits any orientation.
- [ ] Run `node mathmatrix/tools/check-beta-responsive.cjs --root <checkout> --section orientation --browser chromium --report-dir <evidence>` on Windows. Observe failures caused by the existing manifest lock and page transforms before fixing them.
- [ ] Remove initial and resize-time lock code from both entrypoints, Criss-Cross, and both treasure pages. Replace the shared `portrait()` path with `syncViewport()` and update all callers/listeners. Preserve resize-driven board fitting and remove the orientation-only Watch cancellation. Delete obsolete lock prompts, page transforms, and transformed-dialog positioning. Keep real puzzle rotations/mirroring.
- [ ] Remove Tunnels pointer compensation for the artificial whole-page rotation; continue using the real board rectangle. Keep geometry and movement rules unchanged.
- [ ] Run the orientation section again. Confirm rotation preserves an entered number, a Tic-Tac-Toe move/turn, and a started maze's trail/stage. Check Watch advances after rotating without starting a second playback timer.
- [ ] Commit the coherent orientation fix and its checks.

## Task 2: Professional shell, category books, and inline games

**Files:** both entrypoints, new `responsive-ui.css`, `category-chooser.css/js`, `game-layout.css/js`, and the checker.

**Interfaces:** consume Task 1's viewport contract and page markers. Continue using the existing category chooser API and original `.toggleBtn` handlers; introduce no new route or game-state API.

- [ ] Add shell checks at 320x568, 568x320, 390x844, 844x390, 768x1024, 1024x768, 1280x720, and 1920x1080. All 12 `.categoryCard` buttons must be visible and readable at normal text size, and every book must still launch its original choices. The document must not overflow horizontally.
- [ ] Add checks that Back, Sound, Learn/Watch, and the four primary navigation destinations remain reachable; an open dialog's Close remains in the viewport; enlarged text/200% zoom is scrollable rather than clipped; and layout settles after repeated resize events.
- [ ] Run the shell section and retain the failing screenshots/measurements.
- [ ] Apply the spec palette/type scale and a compact welcome/header/navigation. Replace oversized decoration and decorative page gradients with the quieter shared presentation. Preserve artwork and playful board colors.
- [ ] Replace the app's artificial 480-pixel desktop frame with a balanced wider workspace. Reflow categories by real available width/height. Keep boards at a useful maximum size, side by side with controls where suitable; allow vertical content scrolling when readability requires it.
- [ ] Cover all inline modes: Add Magic including large boards, Multiply Magic, Birthday Magic, Gate Logic, Binary Magic, Slide Magic, Sudoku, Pallanguzhi, and Thayam. Keep full-size action controls; do not hide essential instructions to force everything into a short viewport.
- [ ] Run shell checks, all book/choice launch checks, and inline state-preservation checks on Windows. Capture portrait, landscape, tablet, and desktop evidence. Confirm no new errors or ResizeObserver loop/idle churn.
- [ ] Copy the final canonical `beta.html` to `index.html`, verify byte equality, and commit.

## Task 3: Standalone game pages, controls, and dialogs

**Files:** the seven standalone pages, `responsive-ui.css`, `game-layout.css/js`, and the checker.

**Interfaces:** consume Task 1's real-viewport behavior and Task 2's presentation. Keep original game IDs/listeners and the existing Back destinations. Each page owns its board-specific size calculation.

- [ ] Add one real-input play/rotate/continue check per route. Tic-Tac-Toe must cover sizes 3, 4, and 5, and a completed winning line. Capture board contents, turn, and score before rotation; expect the same state immediately after rotation.
- [ ] For both treasure games and Tunnels, exercise a valid movement, a collision attempt, a drag, rotation, and another drag. Verify movement tracks the pointer and trail/stage are preserved. Confirm checkpoint/art references and story/map constants remain unchanged from the baseline. Run Watch through rotation in both treasure routes.
- [ ] Add short-landscape and keyboard-resize checks for game controls, help/sound dialogs, stage reveal, and completion UI. Close and Back must remain reachable; square boards must stay square and maze geometry must not be distorted.
- [ ] Run the games section to record failures, then apply the shared presentation and route-specific board/control grids. Adapt Tic fitting to its actual board region. Preserve SVG/canvas geometry and collision calculations while resizing the page around them.
- [ ] Run games checks on Chromium and WebKit where available. Compare screenshots at the eight target sizes, preserve touch/keyboard behavior, and investigate any dropped/duplicated input or progression change.
- [ ] Commit the standalone-page adaptation and passing checks.

## Task 4: Offline upgrade, performance comparison, and Beta publication

**Files:** both entrypoints, `beta-manifest.json`, `beta-sw.js`, the checker, and release evidence outside application files.

**Interfaces:** consume the completed responsive pages and unchanged game state/storage contracts. Publish only to the Beta repository/path; Main has no write or promotion step in this plan.

- [ ] Add an existing-installation upgrade check using the real baseline served over HTTP, then switch that server to the updated app. Wait for the expected worker to control the page with no installing/waiting worker. Verify the new cache, preserved saved-data markers, offline reload, and offline launches of changed standalone pages.
- [ ] Add checks for duplicate entrypoint bytes, all precache assets present, inline/external script syntax, no obsolete lock code on active routes, and no external runtime/font dependency. Fail the offline section until the manifest/cache/precache changes are complete.
- [ ] Refresh `origin/main`; resolve any source advancement before selecting the next in-app version (V219 if V218 remains current). Use stable manifest name and short name `MathMatrix Beta`, preserve identity/start URL/scope, set orientation to `any`, and bump only the Beta cache. Precache `responsive-ui.css` and every other newly shipped runtime asset.
- [ ] Run the complete checker on Windows for Chromium and available WebKit. Compare time to usable UI, representative input/drag responsiveness, and idle work with the unchanged baseline on the same Windows machine/browser. Investigate repeatable regressions rather than claiming a speed improvement from appearance alone.
- [ ] Review all changed source against the spec, the active route inventory, and the original gameplay/map/story data. Obtain one fresh whole-branch review, address findings, and rerun only affected checks plus the release smoke check.
- [ ] Commit the release/cache changes, push the Beta branch, create and merge a narrow PR, and verify remote `origin/main` plus the matching successful Pages deployment and live file contents. Do not dispatch a build/test workflow.
- [ ] Give the user the live Beta link, version, portrait/landscape evidence, and any browser/device limits. Ask the group to check installed-app rotation and the new appearance on their actual devices. Do not promote Main until that review authorizes it.

## Plan self-review

All design sections map to the four tasks: orientation policy/state, shared visual/layout behavior, every active standalone route/dialog, and offline/performance/release. The five review-focus conditions each have an owning task and explicit check. No new puzzle engine, framework, backend, or Main change is required.
