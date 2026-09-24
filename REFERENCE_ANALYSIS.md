# Galaxy frontend reference analysis

Source: `frontend-glaxy-ideas/Video-73210.mp4` (125.315 s, 720×1280 portrait recording, 30 fps, H.264). The monitor UI occupies a landscape region inside the portrait recording. Analysis used one temporary frame per second plus closer frames around the transition near 87–90 seconds.

## Stable composition

- Deep navy-black full-bleed field with no enclosing dashboard card.
- Blue-white core sits on the horizontal centerline and slightly above vertical center. The white nucleus is about 7–9% of the visible monitor height; the halo extends about four nucleus radii.
- The particle cloud fills the central 60–70% of the screen. Density peaks around the core and falls rapidly, preserving large dark areas at the edges.
- UI panels live near the edges and never compete with the core: market rows at mid-left, small system percentages near top-right, message/task fragments at mid-right, and a shallow voice panel below the core.
- Tiny system labels occupy the top corners and a narrow status line sits below the voice panel.

## Visual system

- Background: near-black indigo (`#01051b` to `#030a2e`).
- Core: white center, electric cyan edge, saturated royal-blue halo.
- Particles: mostly blue-white, with a small number of cyan and faint violet points; sizes vary from subpixel dust to a few brighter foreground motes.
- Panels: translucent navy fill, thin blue borders, modest blur, roughly 10–14 px radius, restrained glow. Text is tiny, condensed, uppercase, and blue-white.
- Bloom is concentrated at the nucleus. Panels have a narrow edge glow and do not bloom heavily.

## Motion

- Particle movement is slow orbital drift with depth parallax, occasional connecting segments, and mild pointer/camera influence.
- Core breathing is gentle and irregular enough to feel alive, with a subtle horizontal lens flare at brighter moments.
- Equalizer bars respond continuously in the bottom panel. Panels remain spatially stable and use only tiny float motion.
- The bright blurred window visible near 87–90 seconds is a temporary transition and is excluded from the default state.

## Constraints

- Keep large dark regions, low text density, and one dominant focal point.
- Do not add neon rainbow colors, dense grids, large sidebar chrome, many charts, orange accents, heavy scanlines, large headings, or constant dramatic camera motion.
- Do not reproduce the physical monitor, desk, keyboard, room lighting, or social-media overlay text.
