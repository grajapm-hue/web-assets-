# Beta Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Publish the approved consolidated navigation and larger book/tab layout to Beta V.224.

**Architecture:** Retain existing app handlers and category navigation. A focused navigation-shell.js/.css pair moves existing controls to a shared header, relocates the release label into About and fits the QR screen. Update category fitting to use the footer's reclaimed space.

**Tech Stack:** Static HTML, CSS, browser JavaScript, service worker, Node Playwright tests.

**Spec:** ../specs/2026-11-13-beta-navigation-design.md

## Global Constraints

- Beta only; Main remains V.223. Keep all twelve categories and existing puzzle behavior.
- Preserve saved puzzles, offline support, app identity and V.223 update resume.
- No chooser scrolling, horizontal overflow, overlapping controls or duplicate visible utility actions.
- Respect safe areas, keyboard focus and reduced motion. Keep version discoverable in About.

## Review Focus

- Narrow portrait with Back and all header controls visible.
- Short landscape phones: readable book text and scannable QR code.
- Rotation without losing the current screen or hiding any category.
- Real header Update and offline restoration after DOM relocation.
- Both Beta entrypoints and installed/uninstalled button labels.

### Task 1: Shared shell and chooser

**Files:** beta-app/{beta.html,index.html,category-chooser.js,navigation-shell.js,navigation-shell.css}; tools/check-beta-navigation.cjs (under mathmatrix).

- [x] Write and run failing responsive tests for header placement, removed footer, twelve reachable categories and four equal tabs.
- [x] Add the focused shell module/styles; retain existing action nodes/handlers and remove the visible footer.
- [x] Adjust landscape width/height independently, add the portrait brand and enlarge bottom tabs.
- [x] Verify narrow portrait, both orientations and laptop layouts.

### Task 2: QR screen, integration and Beta publication

**Files:** the same shell files; beta-app/beta-sw.js; existing Beta UI/tablet/update test files.

- [x] Test the QR tab label, single visible actions, Copy Link, QR rendering, About/version, Offline help and Back.
- [x] Simplify and responsively fit the QR screen; increase QR source resolution and keep a white quiet zone.
- [x] Update release/cache markers, adapt obsolete footer assertions and run gameplay/layout/update checks in Chromium and WebKit.
- [x] Capture phone/tablet/laptop screenshots plus enlarged crops; complete a neutral fresh visual review.
- [ ] Verify real Update, saved-puzzle/offline behavior; create/merge the Beta PR, wait for Pages and verify served source and live browser behavior.

## Execution ledger

- Authorization: the user's latest request approves implementing the reviewed layout and deploying Beta first; no further design or deployment approval is pending.
- Main checkout is read-only during this task. Existing approved V.223 worktrees were clean before starting codex/beta-v224-navigation from origin/main b04b593bfb792e61f9cc1bf182343d5d41dfa9ba.

- Verification: 56 Chromium and 56 WebKit checks passed locally. The real header Update preserved a saved puzzle, both new shell files were among 32 cached assets, saved input restored offline, the maze opened offline, and the Main cache sentinel survived.
- Ruling: landscape QR actions move beside the QR code to preserve a scannable code on short/notched phones; portrait retains Copy Link above and About below. Narrower than 360 CSS px, Update uses an accessible refresh icon and Play Offline uses the compact Offline label.

- Fresh reviews: no concrete visible defects in the final views. Resolved and regression-tested narrow landscape QR overlap, focus loss during rotation, and book-copy clipping at568x320. Native keyboard actions, QR-screen update resume, and idle mutation behavior independently checked in Chromium/WebKit.
