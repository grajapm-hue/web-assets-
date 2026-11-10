# MathMatrix professional responsive redesign

Status: user approved the Beta-first direction on 2026-11-09; Main promotion requires a later review. Product implementation is in progress.

## Intent and confirmed requirements

Group members like the existing play methods and performance. They want a more professional appearance and an app that works naturally in portrait and landscape on every page. Preserve the familiar games, puzzle rules, board contents, movement, feedback, and performance while improving presentation.

The user previously asked to keep every puzzle category together on a compact front page. The current source has 12 category books, including a SaNaMaze book with the three existing maze/adventure choices. Preserve all current choices and direct launch paths; do not restore an older category count from historical packages.

## Approved delivery

Implement and publish the redesign to Beta first so the group can try it. Promote the accepted result to Main only after review. The user selected “Beta first, then Main after review.” The proposed responsive design is the direction approved for the Beta implementation; Main is outside this delivery.

Current reviewed baselines:

- Beta: `grajapm-hue/web-assets-`, `mathmatrix/beta-app/`, commit `b03961fb5d747ef0d14ff275483c4ea3dac6addb`.
- Main: `KidsMathsMatrixPuzzle/kidsmathsmatrixpuzzle.github.io`, repository root, commit `250ffc03093f4687a8708223ffbd980332951fde`.

Refresh the selected repository before implementation and again before publishing. Keep repository-specific manifests, launch paths, navigation links, cache namespaces, and environment labels separate.

## Visual direction: a well-made educational puzzle studio

This is the proposed design direction, chosen by the assistant for review. Keep the monkey identity, recognizable puzzle imagery, and playful color inside the games. Make the surrounding interface quieter and consistent, with readable text and clear actions.

Use a shared palette: paper `#F7FAFD`, white `#FFFFFF`, navy text `#142A43`, cobalt actions `#255EDB`, green success `#168878`, and amber highlights `#D9921C`. Adjust these proposed colors where needed to meet contrast requirements. Reuse existing local images and icons. Use the device's system font stack, without a downloaded font dependency. Use a coherent type scale, modest corner rounding, restrained borders, and little decorative motion.

Start with 16-pixel body text, 14-pixel secondary labels, 20-pixel page titles, and 28- to 36-pixel welcome headings, adjusting these for the actual available space without making essential instructions illegible.

The welcome page should introduce the puzzle collection with a compact brand mark and a clear Play action. The category page should provide a balanced, legible grid of the existing 12 books. Category imagery may retain its individual colors; the surrounding page should not compete with the game. Avoid decorative gradients, oversized mascot blocks, and long copy above the puzzle collection.

## Layout behavior

The intended arrangement, shown schematically rather than as a visual mockup:

```text
Portrait                         Landscape / desktop
[ Back | Puzzle | Help Sound ]   [ Back | Puzzle | Help Sound ]
[          Board             ]   [       Board       ][ Status   ]
[ Status and controls        ]   [                   ][ Controls ]
[ Primary navigation         ]   [ Primary navigation            ]
```

- Portrait phone: compact header, category grid or board, followed by the relevant controls. Keep the existing primary destinations: Puzzles, Play, Get App, and Feedback.
- Landscape phone and tablet: use the actual available width. Put the board and its controls or instructions alongside each other when that improves readability. Reflow category books into more columns. Reduce decorative space before reducing text or touch targets.
- Desktop and larger tablets: provide a balanced wider workspace with navigation and supporting controls beside the main content where useful. Do not stretch a small board edge to edge. Remove the artificial 480-pixel phone frame and black side margins; retain a sensible maximum reading width.
- Preserve each board's intended geometry. A square board stays square; a wide maze or Pallanguzhi board may remain wide inside an adaptive page. Portrait support does not require distorting the puzzle.
- Use real viewport dimensions, including the visible viewport when browser controls or an on-screen keyboard change the available space. Respect safe-area insets.
- Fit the category front page without category-list scrolling at the normal supported test sizes. On unusually short windows or enlarged text/200% zoom, readable content and reachable actions take priority: allow content scrolling instead of hiding controls or making text illegible.
- Aim for 44-pixel action buttons. Dense puzzle cells may be smaller, with at least 24-pixel targets where feasible; do not shrink a large board until its numbers become unreadable merely to force it into one screen.

## Remove portrait enforcement throughout

The lock exists in multiple layers: the manifest, initial page scripts, main app resize handlers, the shared game-layout module, Criss-Cross, and the two treasure-maze pages. The Tunnels page also compensates pointer coordinates for the forced page rotation.

Set the app manifest to allow any orientation. Remove whole-document counter-rotation, forced swapped viewport dimensions, portrait blocking messages, desktop phone-frame rules, and pointer compensation that exists solely for those artificial rotations. Update their callers and resize paths rather than covering active rotation code with another CSS override. Preserve legitimate puzzle rotation/mirror features and character animations.

One current main-app orientation handler stops Watch when entering landscape. The redesign must keep the current puzzle and active Watch state when rotating; remove that orientation-specific cancellation. This requirement does not remove existing user-controlled Stop or Reset actions.

## Page and state coverage

Cover both duplicate app entrypoints and all user-facing destinations, including:

- Welcome, the 12 category books, their existing choices, and the Play tab.
- Add Magic and its supported sizes, Multiply Magic, Birthday Magic, Gate Logic, Binary Magic, Slide Magic, Sudoku, Pallanguzhi, and Thayam.
- Criss-Cross; Tic-Tac-Toe at 3x3, 4x4, and 5x5; Tunnels of SaNa; Cave Treasure Hunt; and the illustrated SaNa Treasure Hunt.
- Learn/How to play, Watch controls, Sound, About, Get App/QR/share, Feedback, alerts, dialogs, and completion feedback.
- The separately served Multiply Magic and Sound Lab utility pages, without treating unused backup HTML files as additional app routes.

Keep Back behavior, direct links, keyboard focus, navigation destinations, and existing sharing/install flows. Dialogs must open upright, fit the current viewport, scroll internally when needed, and keep Close reachable. Do not autofocus a mobile text input merely because a panel opens.

Rotation and resize must not start a new puzzle, clear entered numbers, change a player's turn or score, reset a maze stage or trail, discard a timer, or restart/stop Watch. Maze maps, collisions, gates, checkpoints, backtracking, decoy consequences, story order, and original artwork remain unchanged.

## Installation, offline use, and performance

Keep existing install identity, start URL, scope, and saved-data keys. Main retains the user-approved stable name `MathMatrix Main`. For the redesigned Beta, propose the stable installed name `MathMatrix Beta`, with the release version displayed inside; this proposed name is part of the design approval and avoids another version number becoming stale under the icon.

Use the next appropriate in-app release number against the current repository tip. Bump only the selected app's service-worker cache revision and include all changed/new shared assets. Prove the update from the previous cache and an offline reload. Do not clear all site data to deliver the redesign.

Build on the current static HTML/JavaScript app. Do not introduce a framework, a UI component library, a remote font, analytics, or a new backend. Share tokens and truly common layout behavior; keep puzzle-specific sizing inside the puzzle that owns it. Throttle resize work and avoid recurring layout work while the app is idle.

## Verification and release acceptance

Run builds and checks on Windows. The user clarified that the Mac-only workspace instruction applies to DotMD, not MathMatrix. Capture the current baseline before changing presentation so behavior and performance comparisons use the same device/browser and puzzle.

Test portrait and landscape at phone 320x568 and 568x320, 390x844 and 844x390, tablet 768x1024 and 1024x768, and desktop 1280x720 and 1920x1080. Also check enlarged text/200% zoom, visible keyboard focus, reduced motion, browser toolbar/keyboard resizing, and touch input on the mazes. Use Chromium and WebKit where available, and report any browser/device limits explicitly.

For every active family, verify launch, an interaction that changes game state, rotation in both directions, preserved state, and Back. Explicitly check large number boards, all Tic-Tac-Toe sizes, Watch during rotation, traditional boards, maze pointer alignment/collision rules, and dialogs. Check for clipped controls, horizontal page overflow, unreadable text, errors, and accidental duplicate actions.

Compare time to usable UI and representative touch/drag responsiveness with the baseline under the same conditions. Investigate any repeatable new delay, animation stutter, idle resize loop, or duplicated listener before release; do not claim a performance improvement without measured evidence.

Verify service-worker control, upgrading an existing cached installation, offline reload, and offline launches of the changed standalone pages. Confirm duplicate entrypoints remain identical when that is the repository's existing contract.

Publish through a narrow PR after the selected design is approved and checks pass. Verify the merged remote commit, successful Pages deployment for that commit, and matching live files. Browser automation is not proof of a particular phone's installed-app metadata or launcher behavior; include a short real-device Beta rotation check in group review before Main promotion.

## Choices left to the builder

The builder may choose the exact CSS breakpoints, module/file boundaries, per-board size calculations, and icon implementation as long as they satisfy the behavior above. The proposed palette may be tuned for contrast. Do not add features or change puzzle rules as part of this visual and orientation upgrade.
