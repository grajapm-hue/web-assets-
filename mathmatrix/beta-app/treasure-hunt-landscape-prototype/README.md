# SaNa Treasure Hunt Maze

A fixed cave maze with nine ordered checkpoints: Start, Key, Map, Leaf Shield, Tribes, Metal Mesh, Dragon, Treasure and Exit. The standalone landscape prototype includes local 4:3 story artwork and can run offline.

## Open and start

This GitHub Pages build is served from `mathmatrix/beta-app/treasure-hunt-landscape-prototype/`. Open `index.html` in a modern browser. For offline use, keep the `assets/interactive-treasure-hunt-maze-original/` folder beside it. Choose a player color and press **START**.

In the MathMatrix Beta app, choose **SaNa Treasure Hunt Interactive** immediately after **Cave Treasure Hunt**. Story images pop up at checkpoints. The app opens this maze in its own game view; use **Back to puzzles** to return to Beta.

## Follow the route

1. **Start:** choose a player color and press START.
2. **Key:** collect it to open the Map locker.
3. **Map:** collect and read it.
4. **Leaf Shield:** collect it before the Tribes.
5. **Tribes:** use the Leaf Shield on the actual crossing.
6. **Metal Mesh:** collect it before the Dragon.
7. **Dragon:** protect the whole party with the mesh on the actual crossing.
8. **Treasure:** collect it, then continue toward the Exit.
9. **Exit:** follow the tunnel to finish the maze.

The tracker shows progress through all nine checkpoints. Their room markers stay hidden during play.

## Hazards and cautions

- Key, Map and Treasure detours remain blocked until their matching item is collected.
- Without the Leaf Shield, crossing the Tribes sends SaNa back to Start and clears that attempt's route, items and progress. The same color may try again. With the shield, the decoy is blocked; turn back and cross the actual Tribes path.
- At the Dragon, the Metal Mesh must cover the whole party. Without it, poison gas ends the run and retires that color; choose another color. With the mesh, the decoy is blocked; turn back and cross the actual Dragon path safely.
- The trail is one continuous line. Retrace it from SaNa in reverse order to go back. You cannot cross an old segment or jump across an intersection.
- Treasure and exit stories follow the route: the closed chest appears on approach, the explorers with the treasure appear at the Treasure checkpoint, drink and sleep appear at the Rest Room after the next turns, the exit scene appears at the Exit passage, and the escape scene appears at the actual cave opening. An open story card pauses movement until it advances or is continued. Rest is a timed story scene, not a tracker checkpoint.

## Controls and run actions

- Hold one direction button or keyboard arrow at a time; release at turns. You can also drag SaNa along the tunnel.
- **WATCH** follows the route from the cave entrance and pauses at story messages. **STOP** ends Watch.
- **CLEAR** stops Watch, closes an open story popup, clears progress and releases retired colors, then returns to color selection. Choose a color and press **START** for a fresh attempt.

## Artwork

The `assets/interactive-treasure-hunt-maze-original/` folder contains 20 lowercase, hyphenated PNGs at **1448 × 1086 pixels (4:3 landscape)**. Keep these filenames and the matching HTML paths in lowercase for case-sensitive hosting. They are composed to show the full scene or object in the popup. “Treasure ahead” shows the closed chest at a distance; “Treasure found” shows the open chest. The Tribes return scene shows the disappointed explorers being safely escorted toward the entrance. The Dragon scenes show the mesh protecting the whole party or all three explorers fainting without it.

The illustrations were made with the built-in image generation tool in a consistent storybook style. Prompts specified a 4:3 scene, safe margins, and no text, interface elements, borders or watermarks.
