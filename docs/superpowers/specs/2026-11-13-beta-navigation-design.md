# Beta navigation cleanup: approved design

The user approved the prior layout review and requested implementation and publication in Beta first, covering Android/iPhone/iPad/tablet portrait and landscape and laptop landscape. Main remains V.223.

Reuse the current HTML/PWA and existing event handlers. One shared header on the chooser, QR Code and feedback screens holds Update, Install/Installed, Play Offline and Share, with Back where needed and Sound at the right. Remove the chooser's utility footer. Retain all twelve categories and their existing puzzle navigation, and give the reclaimed space to book cards and four equal bottom tabs. Portrait moves the app brand above Choose a puzzle; landscape keeps it in the header. Narrow-screen controls must remain readable and usable.

Rename Get App to QR Code. Its visible content is Copy Link, a high-contrast responsive QR code, one scan heading and brief instructions, and About. Move the release label into About. Keep the welcome screen, native installation/share behavior, offline instructions, saved puzzles, safe areas and V.223 automatic-update resume behavior.

Approaches: duplicating controls would retain the reported repetition; rewriting the application shell would add unrelated risk. A focused navigation module and stylesheet can move the existing nodes and fit the QR content while retaining the game code. Hidden legacy action targets may remain as handler bridges but must not appear visually or in the accessibility tree. Publish as Beta V.224 after browser and visual verification. Device emulation is not physical-device proof.
