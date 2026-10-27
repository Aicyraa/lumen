# Lumen website UI mockups

The design handoff bundle the Lumen website was built from, exported from Claude Design (claude.ai/design). The files are HTML, CSS and JavaScript prototypes, not production code: the real implementation is `apps/web`. What each page and tab does, and the design system extracted from these mockups, is in [docs/WEBSITE.md](../WEBSITE.md).

## Use it

- Read `project/Lumen Website.dc.html` in full: it is the primary design (static high-fidelity screens). Then follow its imports, so you understand how the shared components, CSS and scripts fit together.
- `project/Lumen Prototype.dc.html` is the interactive prototype.
- Recreate the designs in the target technology (this repo uses React); match the visual output rather than copying the prototype's internal structure. Dimensions, colors and layout rules are spelled out in the source, so read the HTML and CSS directly. Rendering the files in a browser or taking screenshots is optional.
- If anything is ambiguous, confirm scope before implementing.
- Where a mockup differs from `docs/AI_BUILD_BRIEF.md` (see "Design source" under Phase 4), the brief wins. In particular the mockups show pricing and savings content that Lumen does not build.

## Configuration and tests

None. The bundle has no build step and no tests.

## Layout

```text
README.md                         this file
project/
  Lumen Website.dc.html           static hi-fi screens (the primary design)
  Lumen Prototype.dc.html         interactive behaviour
  support.js                      the design-canvas runtime only; it has no product content
  .thumbnail                      preview image of the project
  uploads/                        outdated copies of reference files (not tracked in git; ignore)
```
