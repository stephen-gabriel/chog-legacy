# Chog Legacy — your new UI

The product is still **Chog Legacy**. The new visual direction is **The Milkwood Journal**: creamy paper, cocoa ink, sage accents, original woodland artwork and a character journal built around the actual game.

## What to do

1. Extract this ZIP. You will get a folder named `ui-rebirth`.
2. Open `PREVIEW.html` in Chrome or Edge to explore the design. It runs offline: home → practice → choice → saved chapter → simulated inheritance. Real NFT lookup and wallet sign-in are intentionally unavailable in this preview.
3. Put the entire `ui-rebirth` folder inside your existing Chog Legacy project, beside `package.json` and `_build_plan`.
4. Open that existing project in OpenCode and paste:

> Read `ui-rebirth/OPENCODE_PROMPT.md` and carry out the full UI integration in the existing Chog Legacy project. Preserve the current backend and gameplay. Apply the supplied implementation, run the listed checks, fix regressions, and show me the finished app locally. Do not deploy or push yet.

You do not need to manually replace every file. OpenCode should merge the supplied changes into your current project, retaining work added since your uploaded ZIP.

## What is in here

- `apply/`: the replacement/addition files, already arranged by project-relative path.
- `PREVIEW.html`: a standalone design preview with actual browser-local practice gameplay. Its storage key is separate from the normal app.
- `OPENCODE_PROMPT.md`: complete integration and verification instructions.
- `VALIDATION.md`: what was checked here and what still requires your full project.
- `PATCH_MANIFEST.json`: source/replacement hashes to help OpenCode detect newer local changes.
- `verification/`: portable regression checks for the two presentation mapping corrections and the browser-check results.

The preview is not your production website. OpenCode must integrate `apply/` into the existing application, which already contains your API, wallet authentication and deployment setup.

There is one current visual specification: `_build_plan/UI_DESIGN.md`. The old `_build_plan/ui-design/` files become an explicitly retired reference. The new docs update the existing build plan; they are not competing PRD/FRD copies.

The supplied illustration is for the fictional practice character only. Real Chogs continue to use their authentic NFT metadata images.
