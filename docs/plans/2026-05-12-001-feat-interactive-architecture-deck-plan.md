---
title: "feat: Interactive architecture deck"
type: feat
status: active
date: 2026-05-12
origin: docs/brainstorms/2026-05-12-interactive-architecture-deck-requirements.md
---

# feat: Interactive architecture deck

## Summary

A single self-contained HTML file built with hand-authored SVG and vanilla JavaScript, structured in eleven implementation units (U1–U11 — U1/U2/U3 were split into finer units during round-1 plan review for atomic-commit hygiene). Custom fonts inlined as base64 WOFF2 data URIs with a system-font fallback; lifecycle animation driven by a `data-step` attribute on the canvas; verification is manual browser checks per unit logged in the Verification Log at the bottom of this plan. The deck stamps both ARCHITECTURE.md and FIX_PLAN.md at boundary-labs commit `4f09569` and is a defense-day artifact (drift acceptable after the Architecture Defense gate).

---

## Problem Frame

The deck exists to give the Architecture Defense gate and future-you walkthroughs a hoverable surface that ARCHITECTURE.md's prose can't provide. Full motivation, actors, key flows, and acceptance examples are carried in the origin requirements doc (`docs/brainstorms/2026-05-12-interactive-architecture-deck-requirements.md`) and are not restated here.

---

## Requirements

- R1. Single self-contained HTML file checked into the boundary-labs repo under a stable path inside `docs/`.
- R2. Loads and renders correctly when opened directly in a modern desktop browser without a server, package install, or build step required of the viewer.
- R3. Two content sources with explicit roles, both version-stamped: ARCHITECTURE.md for text content, FIX_PLAN.md for diagram structure until the WU sequence lands. The 13-step lifecycle count overrides FIX_PLAN.md WU-9b's 11-step validation. (See origin.)
- R4. **Slide 1 — Title.** Names the platform, states what it does in 1–2 sentences (elevator pitch), identifies the target.
- R5. **Slide 2 — System Map.** Full system architecture as a single canvas using FIX_PLAN's Figure 1 + Figure 2 design language. Lifecycle overlay animates through 13 steps; trust-tier toggle swaps coloring; step-forward toolbar at top-right; right-arrow precedence rule (lifecycle first, then slide-nav); composition rules across the four interaction systems.
- R7. **Slide 3 — Approval Flow.** WU-23 approval sequence diagram with 10 numbered steps + TTL auto-reject branch + post-approval revalidation. Distinct slide-3 participant-panel schema.
- R8. **Slide 4 — Target Attack Surface.** Clinical Co-Pilot endpoint surfaces as a focused diagram; hover reveals per-surface attacks.
- R9. **Slide 5 — Threat Coverage.** 10-category threat model as a 3-state heat map (covered / partial / not-covered); hover reveals category one-line summary sourced from ARCHITECTURE.md's table. No coverage-state rationale duplicated.
- R10. **Slide 6 — Data Contracts.** AttackCase / AttackAttempt / JudgeVerdict / Message Envelope as visual cards in a linear chain with Envelope frame.
- R11. Hover any component dims the rest of the canvas, highlights inbound/outbound connections, fills right-rail side panel. Panel pushes canvas to 720px minimum width; below that, panel docks below the canvas in split layout (slide-index strip stays fixed-bottom; docked panel reserves a 48px bottom margin). Lifecycle overlay scales proportionally in docked mode.
- R12. Side panel schema — for system components: purpose, trust tier with color swatch, inputs, outputs, allowed tools, denied tools, failure modes. For edges/connections: relationship label, source/target trust tiers, boundary notes. Canonical names: "Campaign Runner" for the role; `pydantic_graph.Graph` only in implementation-notes contexts.
- R13. Hover-off returns canvas to rest state; cursor moving into panel does NOT trigger hover-off; click-to-lock pins panel with inline-SVG pin icon (outlined/filled) + teal accent border. Locked state takes precedence; release on pin click / empty-canvas click / Escape.
- R14. Keyboard navigation (left/right arrows; "T" toggles trust-tier; Escape releases lock) plus click navigation.
- R15. Visible slide index shows number AND title for all six slides.
- R16. Clean-academic visual style anchored to arXiv preprint typography. Custom fonts (Source Serif Pro / Inter / JetBrains Mono) with system-font fallback if subsetting fails or exceeds time-box (per U8). White/off-white background; navy + teal accents; muted trust-tier palette. Motion opacity-only, max 150ms, no transforms.
- R17. Reuses FIX_PLAN's design conventions: five-tier trust palette (muted), node shape vocabulary, Figure 1 / Figure 2 split, labeled lifecycle steps.

**Origin actors:** A1 (Engineer-author / future-you), A2 (Architecture Defense grader), A3 (Demo viewer)
**Origin flows:** F1 (Live architecture walkthrough), F2 (Solo reference lookup, retiring when WU sequence lands)
**Origin acceptance examples:** AE1 (Slide-2 hover dim + panel content), AE2 (hover-off restoration), AE3 (lifecycle step-forward animation), AE4 (Slide-3 participant hover + sequence-participant schema), AE5 (Slide-6 contract card hover + link), AE6 (sampled content sync against stamped commit — 5 components per slide; not exhaustive), AE7 (click-to-lock state-machine transitions)

---

## Scope Boundaries

- Build plan timeline slide; Open Decisions slide.
- "Quiet ↔ explore" mode toggle (single mode only).
- Speaker notes / presenter view.
- Multiple themes or dark mode.
- Print or PDF export.
- Embedding live runtime data from a running campaign.
- Editing affordances on the diagrams.
- Mobile or touch-optimized layout (desktop only).
- Server-side rendering or any non-static deployment.
- Cross-deck navigation, search, or full-text indexing.
- Automated test framework — verification is observational, logged in the Verification Log.
- Build step / bundler / minifier.
- CDN-loaded libraries.
- Color-blind redundant encoding on trust tiers (brainstorm F13 Skip).
- "Considered Alternatives" justification for the deck premise (brainstorm F7 Skip).

### Deferred to Follow-Up Work

- Re-stamping mechanism for future deck rebuilds against newer commits.
- README link to `docs/architecture-deck.html`.

---

## Context & Research

### Relevant Code and Patterns

- `ARCHITECTURE.md` at commit `4f09569` — canonical source for all hover-panel text content.
  - Slide 2 panel content: `## Agent Roles` + `## Platform Services` + `## Target Adapter` + `## Inter-Agent Coordination`.
  - Slide 4 panel content: `## Target-Specific Attack Surface From Repo Research`.
  - Slide 5 panel content: `## Threat Model Scope` (category + Initial defense signal only).
  - Slide 6 panel content: `## Data Contracts` subsections.
- `FIX_PLAN.md` at commit `4f09569` — canonical source for diagram structure (Figure 1/2 layout WU-9a/9b, node-shape vocabulary WU-10, trust palette, WU-23 sequence-diagram structure).
- No existing HTML/CSS/JS patterns in the repo — greenfield. Implementation conventions established by this plan.

### Institutional Learnings

- None (`docs/solutions/` does not exist).

### External References

- Source Serif Pro: Adobe Fonts (open-source transitional serif). Repo: github.com/adobe-fonts/source-serif.
- Inter: rsms.me/inter (humanist sans). Available as variable font and static WOFF2.
- JetBrains Mono: github.com/JetBrains/JetBrainsMono (monospace).
- `fonttools` (Python, `pip install fonttools`) or `glyphhanger` (Node, `npm install -g glyphhanger`) for Latin-only WOFF2 subsetting.

---

## Key Technical Decisions

- **Hand-authored SVG + vanilla JavaScript over libraries.** `file://` origin disqualifies CDN-loaded libraries; bundling Mermaid inline is dead weight; cytoscape.js / React Flow are layout generators unneeded for hand-positioned diagrams.
- **Single self-contained `.html` file with inlined `<style>` and `<script>` blocks.** Maximum portability — double-click opens it.
- **Lifecycle animation driven by a `data-step` attribute on the canvas.** CSS rules show lifecycle path elements based on `data-step`; vanilla JS increments. No timers needed.
- **Inlined base64 WOFF2 fonts, Latin-only subset, Regular + Bold per family — with system-font fallback.** Custom fonts targeted; if subsetting toolchain exceeds 2-hour time-box, U8 falls back to system stack (see U8 Approach).
- **Manual browser verification, no test framework.** Verification is logged in the Verification Log at the bottom of this plan — per-unit checkboxes + a final demo-rehearsal row.
- **Single state object for Slide 2** holds `active_step` / `hover_target` / `locked_target` / `trust_mode`. Render priority: locked > hover > idle; lifecycle and toggle layer independently.
- **SVG `viewBox="0 0 1280 720"` for all canvases.** Standard 16:9.
- **Version-stamp comment at top of `<head>`.** Four lines: ARCHITECTURE.md commit, FIX_PLAN.md commit, diagram-authoritative-at-stamp-time note (specifying that Slide 2 sources Figure 1/2 from FIX_PLAN WU-9a/9b, Slide 3 sources sequence diagram from FIX_PLAN WU-23, all other panel content sources from ARCHITECTURE.md), rebuild instructions.

---

## Open Questions

### Resolved During Planning

- Implementation choice: hand-authored SVG + vanilla JS.
- Single `.html` file vs co-located: single file.
- Lifecycle animation mechanism: `data-step` + CSS opacity transitions.
- Version-stamp generation: manual write at file creation.
- SVG layout coordinate space: 1280×720 viewBox. Starter coordinate tables in U2 and U4.
- Persona-hijacking 11th cell on Slide 5: footnote annotation below the 5×2 grid (per F8).
- Trust-tier toggle UI label: "Base" / "Tiers" (per F14 — state-object identifier `trust_mode` unchanged).
- Pin icon source: inline SVG symbols mirroring Heroicons map-pin outline/solid (per F13).
- U-unit granularity: split U1/U2/U3 into U1+U8, U2+U9+U10, U3+U11 for atomic-commit hygiene.

### Deferred to Implementation

- Exact hex values for `--navy`, `--teal`, and the five muted `--trust-*` colors. Pick during U1 by browser eye-test.
- Exact font-weight selection within each family (or fallback if U8 falls back).
- Final per-component pixel coordinates on each slide. Starter tables in U2 and U4 give the grid.

---

## Output Structure

```
docs/
├── architecture-deck.html                                            [this plan creates]
├── brainstorms/
│   └── 2026-05-12-interactive-architecture-deck-requirements.md      [existing — origin]
└── plans/
    ├── 2026-05-12-001-feat-interactive-architecture-deck-plan.md     [this file]
    └── 2026-05-12-001-panel-content-inventory.md                     [U9 prerequisite scratch]
```

This plan creates one new deck artifact (`docs/architecture-deck.html`) plus one scratch file (`docs/plans/2026-05-12-001-panel-content-inventory.md`) used during U9 to track the ~90 hand-extracted content fragments.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

**State shape for Slide 2 (single source of truth):**

```
state = {
  active_step:    int 1..13 | null,
  hover_target:   node_id | edge_id | null,
  locked_target:  node_id | null,
  trust_mode:     "base" | "trust_tiers",
}
```

**Render priority (applied each frame / state change):**

1. **Trust-tier toggle** independently changes node fill colors and shows/hides the legend overlay.
2. **Lifecycle overlay** independently shows lifecycle paths up to `active_step`.
3. **Panel content selection** (priority order):
   - `locked_target` set → panel shows locked_target; pin filled; teal border.
   - Else `hover_target` set → panel shows hover_target; dim non-connected.
   - Else → panel hidden; canvas at full opacity.

**Right-arrow precedence (Slide 2 only):**

```
if active_step < 13: increment active_step
else:                advance to Slide 3
```

Left-arrow is the mirror.

---

## Cut Order Under Deadline Pressure

Defense gate is on a 4-hour-after-kickoff clock. If implementation slips, this is the pre-decided cut order so the engineer does not improvise the cut line under pressure.

**Minimum shippable for Defense (must land before gate):**
- U1 (scaffolding + Slide 1 + nav)
- U8 (font subsetting — or fall back to system fonts per U8 internal fallback)
- U2 (system map SVG canvas with shapes/positions)
- U9 (panel HTML/CSS + R12 content transcription — at minimum 4 components, not all 15)
- U10 (hover-dim + side-panel state)
- U4 (Slide 3 approval flow sequence diagram)

**Additions in priority order (ship as many as time allows):**
1. **U3** — Slide 2 lifecycle overlay + step controls + trust-tier toggle. Headline interactive feature; ship if possible.
2. **U7** — Slide 6 data contracts. Grader probes this directly; high-value.
3. **U5** — Slide 4 target attack surface. Standalone simple slide.
4. **U11** — Click-to-lock + composition rules. Polish, not load-bearing.
5. **U6** — Slide 5 threat coverage. Can degrade to a static image fallback (or omit entirely with a verbal callout: "Coverage tracking is Phase 6 work; ARCHITECTURE.md §Threat Model Scope carries the full table").

If U2/U9/U10 collectively overrun by more than 2 hours, drop U11 and U6 immediately; do not attempt U3 step controls if U10 isn't stable.

---

## Implementation Units

Eleven units total. U1, U2, U3 carry their original-concept identity from the round-0 plan; U8–U11 are split-out concerns assigned the next-available U-IDs per the stability rule. Dependency-ordered (not sequentially numbered).

- U1. **Project scaffolding + Title slide + navigation infrastructure**

**Goal:** Create `docs/architecture-deck.html` with the version-stamp comment block, root CSS variables, slide container shell, slide index strip, left/right arrow navigation handlers, and Slide 1 content. No font subsetting (split to U8).

**Requirements:** R1, R2, R4, R14, R15

**Dependencies:** None

**Files:**
- Create: `docs/architecture-deck.html`

**Approach:**
- HTML skeleton with `<head>` carrying version-stamp comment (4 lines per Key Technical Decisions), `<meta charset>`, `<title>`, inlined `<style>`. `<body>` carries `<main id="deck">` with six `<section data-slide="N" data-title="...">` placeholders, `<nav id="slide-index">`, `<aside id="panel" data-mode="hidden">`, and inlined `<script>`.
- Root CSS variables (placeholder values to refine during eye-test): `--navy`, `--teal`, `--trust-untrusted`, `--trust-low`, `--trust-medium-low`, `--trust-medium`, `--trust-high`, `--canvas-min-width: 720px`.
- Slide container: only `[data-active]` section visible; opacity transition ≤150ms.
- Slide index strip: fixed-bottom (48px tall), six labeled buttons matching R15 titles. **Docked-mode rule:** when viewport width < 720px, docked panel reserves a 48px bottom margin so it doesn't overlap the strip — `@media (max-width: 720px) { #panel[data-mode="open"] { bottom: 48px; } }`.
- Navigation JS: keyboard ArrowLeft/ArrowRight (Slide-2 precedence wired in U3), "T" (wired in U3), Escape (wired in U11). Click handlers on slide-index buttons.
- Slide 1 content: `<h1>` platform name (48px Source Serif Pro Bold), `<p>` elevator pitch (20px Inter Regular), `<p>` target identification (16px Inter Regular with muted color). Centered.

**Test scenarios:**
- *Happy path* — Double-click the HTML. Page renders, no console errors. Slide 1 title + pitch + target visible. ArrowRight advances to Slide 2 (empty placeholder). Slide-index strip highlights "2 — System Map".
- *Edge case* — Open in Firefox + Safari. Rendering parity (layout, no console errors, nav works).
- *Edge case* — Resize browser to 700px. Verify docked-mode CSS triggers; slide-index strip stays at bottom; (empty) panel area reserves space above the strip.

**Verification:** All six slide sections exist; nav works; slide-index strip with six titles; Slide 1 displays correctly; version-stamp comment includes both source commits + diagram-authoritative note.

---

- U2. **Slide 2 — System Map SVG canvas (shapes and positions)**

**Goal:** Hand-author the SVG system map matching FIX_PLAN's Figure 1 + Figure 2 layout. SVG only — no panel infrastructure, no hover handlers.

**Requirements:** R5 (canvas only), R17

**Dependencies:** U1

**Files:**
- Modify: `docs/architecture-deck.html` (Slide 2 `<section>` SVG content)

**Approach:**
- SVG canvas: `<svg viewBox="0 0 1280 720">` inside Slide 2 `<section>`. Hand-position ~15 components.
- **Starter coordinate grid** (5 rows × 5 columns; iterate from here):
  - Rows: y=80 (humans), y=220 (control plane), y=370 (campaign agents), y=510 (target adapter + target), y=640 (storage + observability).
  - Columns: x=160, 400, 640, 880, 1120.
  - Top row (y=80): Operator @ x=160, Security Console @ x=400, Slack @ x=1120.
  - Second row (y=220): Safety Gate Service (hexagon) @ x=400, FastAPI Control Plane @ x=640, Campaign Runner @ x=880.
  - Middle band (y=370): Coverage Scoring Service (hexagon) @ x=160, Orchestrator @ x=400, Red Team @ x=640, Judge @ x=880, Documentation @ x=1120; Regression Promotion Service (hexagon) somewhere in middle band — let positioning settle during layout pass.
  - Lower band (y=510): Target Adapter @ x=640, Target/Clinical Co-Pilot @ x=1120.
  - Bottom row (y=640): Security App DB / Artifact Store / Audit Ledger (cylinders) @ x=160/400/640, Queue (asymmetric) @ x=880, Observability Layer @ x=1120.
- Each node carries `data-component-id`, `data-trust-tier`, `data-node-shape` attributes.
- Each edge carries `data-edge-id`, `data-source`, `data-target`. Draw edges between connected components per FIX_PLAN Figure 1/2.
- Shapes: rectangles for 4 LLM agents (Orchestrator, Red Team, Judge, Documentation); hexagons for 3 services (Safety Gate, Coverage Scoring, Regression Promotion); cylinders for 3 storage backends; asymmetric trapezoid for Queue; distinctive shape for Target.
- Hard time-box: 60 minutes for layout pass; if exceeded, ship rough layout and polish post-defense.

**Patterns to follow:** FIX_PLAN.md WU-9a / WU-9b for Figure 1/2 design language.

**Test scenarios:**
- *Happy path* — Open Slide 2. All ~15 components render with correct shapes (rectangles for agents, hexagons for services, cylinders for storage, asymmetric for queue). Labels readable. Edges drawn between connected components.
- *Edge case* — Coordinates don't overlap labels; no label clips canvas edges. Iterate if needed within the 60-min time-box.

**Verification:** SVG canvas renders within the 1280×720 viewBox; ~15 components present with correct shape vocabulary; trust-tier `data-trust-tier` attribute correct on each node (for U10 to read later).

---

- U3. **Slide 2 — Lifecycle overlay + step controls + trust-tier toggle**

**Goal:** Layer the lifecycle overlay path through 13 steps, the step-forward toolbar, and the trust-tier toggle onto Slide 2. Click-to-lock and right-arrow precedence are deferred to U11.

**Requirements:** R5 (lifecycle + toggle + step controls)

**Dependencies:** U2, U10 (state object)

**Files:**
- Modify: `docs/architecture-deck.html`

**Approach:**
- **Canvas toolbar** (top-right of SVG viewBox at coordinates (1050, 30) to (1240, 70) — 40px tall, ~190px wide): horizontal row containing:
  1. Trust-tier toggle button (~80px wide). Two states labeled "Base" / "Tiers". Filled when active (Tiers mode), outlined when inactive (Base mode). Keyboard shortcut "T".
  2. Step counter ("N / 13", ~50px). At step 13, label transitions to "Done".
  3. Step-forward button (~50px). Arrow icon → circular-arrow (Replay) icon at step 13.
  Minimum 8px gap between elements. When canvas shrinks to 720px min-width, toolbar shifts to keep its right edge anchored at canvas-right minus 20px.
- **Lifecycle overlay:** 13 SVG `<path>` elements, one per lifecycle step (per ARCHITECTURE.md `## Inter-Agent Coordination`). Each carries `data-step="N"`. Default opacity 0 (hidden). CSS rule: SVG root carries `data-active-step="N"`; rule `[data-active-step="N"] [data-step][data-n-leq-active] { opacity: 1; }` shows steps ≤ active; non-active fade to 0.3 opacity.
- **Step-forward button:** click → increment `state.active_step` from 0 to 13; at 13, transition to Replay icon; next click sets to 0.
- **Trust-tier toggle:** click or "T" → toggle `state.trust_mode`. When `"trust_tiers"`, JS sets `data-trust-mode="active"` on SVG root; CSS rule swaps node fills via `[data-trust-mode="active"] [data-trust-tier="<tier>"] { fill: var(--trust-<tier>); }`. Trust-tier legend overlay (`<g class="trust-legend">`) appears in the corner.
- Composition rules (a) and (b) — toggle preserves lifecycle step; hover panel content uses R12 schema in both modes (per U10).
- Slide navigation away from Slide 2 preserves `active_step` and `trust_mode`; reset is U11's responsibility for hover/lock fields.

**Test scenarios:**
- *Happy path — Covers AE3.* On Slide 2 with `active_step = 0`, click step-forward 13 times. Verify: each step path highlights in order; counter increments. At step 13, button shows Replay icon. Click Replay; counter resets.
- *Happy path* — Press "T". Trust-tier mode activates; nodes' fills swap; legend appears. Press "T" again; mode deactivates.
- *Edge case — composition rule (a).* Press "T" at step 7. Lifecycle step 7 stays highlighted; nodes swap to tier colors.

**Verification:** Lifecycle animates through 13 steps via button or keyboard. Trust-tier toggle works via click and "T". Composition rules (a) and (b) hold.

---

- U4. **Slide 3 — Approval Flow sequence diagram + participant content-map**

**Goal:** Hand-author the WU-23 approval sequence as an SVG sequence diagram (6 participants × 10 numbered steps + alt-path branch). Build a participant content-map sub-deliverable that maps each participant × 5 schema fields to source line ranges.

**Requirements:** R7

**Dependencies:** U10 (panel infrastructure for the slide-3 participant schema)

**Files:**
- Modify: `docs/architecture-deck.html` (Slide 3 SVG content)
- Create (inline HTML comment within the Slide 3 `<section>`): participant content-map table comment block

**Approach:**
- **Starter lifeline coordinates** (6 participants, 1280px wide): x=120 (Operator), x=340 (Slack), x=560 (API), x=780 (Safety Gate Service), x=1000 (Campaign Runner), x=1220 (Audit Ledger). Lifelines as vertical SVG `<line>` from y=80 to y=620.
- **Step y-coordinates:** steps 1–10 at y = 120 + 50N. Each step drawn as a horizontal arrow with label and step number. Self-loop (step 8) drawn as an arc on Safety Gate's lifeline.
- **Alt-path branch:** TTL-expires path branches to the right of the Audit Ledger column with a dashed-line stroke + muted color. Two arrows: auto-reject (SG → Audit) and abort (SG → Campaign Runner).
- Each arrow carries `data-step="N"`, `data-source="<participant>"`, `data-target="<participant>"`.
- **Participant content-map sub-deliverable:** an HTML comment block at the top of the Slide 3 `<section>` listing 6 participants × 5 schema fields (role / messages-sent / messages-received / decision-criteria / TTL-failure-behavior) with source line references to ARCHITECTURE.md `## Inter-Agent Coordination` (lifecycle steps) and `## Slack Human-In-The-Loop` (Slack-specific behavior). The map makes the synthesis verifiable rather than tacit.
- **AE6 carveout:** Slide-3 participant content is explicitly marked as "synthesized from the 10 numbered steps" rather than "verbatim from ARCHITECTURE.md" — the AE6 verbatim-match standard does not apply to Slide 3.
- Time-box: 60 minutes for sequence-diagram layout pass.

**Test scenarios:**
- *Happy path — Covers AE4.* Hover Safety Gate Service participant. All arrows from/to SG highlight (steps 1, 2, 3, 5→7, 8, 9, alt-path). Panel shows slide-3 participant schema for SG (role, messages sent/received with step numbers, decision criteria, TTL behavior).
- *Happy path* — 10 numbered steps visible and readable. Alt-path branch visually distinct.

**Verification:** All 10 steps + alt-path rendered with readable labels. Participant content-map comment block present in HTML. Slide-3 panel schema works on hover.

---

- U5. **Slide 4 — Target Attack Surface map**

**Goal:** Render Clinical Co-Pilot endpoint surfaces as a 6-card surface map. Per-card hover reveals attacks.

**Requirements:** R8

**Dependencies:** U10 (panel infrastructure)

**Files:**
- Modify: `docs/architecture-deck.html` (Slide 4 SVG content)

**Approach:**
- 6 surface cards in a 3×2 grid (or 2×3 — pick at layout time): `/conversation` SSE, `/copilot/ingest`, `/copilot/documents/*`, SMART launch + session, Pydantic AI supervisor tools, Internal OpenEMR API token boundary.
- Each card: header (endpoint name), subhead (file path), short description body. `data-surface-id` attribute.
- Hover behavior reuses U10's infrastructure. Slide-4 panel schema (distinct from R12): endpoint name / evidence in target repo (file path) / security-app test focus (attack list verbatim from ARCHITECTURE.md `## Target-Specific Attack Surface From Repo Research`) / known limitations (e.g., tool-trace limitation on Pydantic AI supervisor tools card).

**Test scenarios:**
- *Happy path* — Hover `/conversation` SSE card. Panel surfaces "Multi-turn prompt injection, malformed or long `q`, patient binding mismatch, request-id correlation, verifier strip-all behavior, critic bypass."
- *Happy path* — Hover Pydantic AI supervisor tools card. Panel surfaces attack list + the tool-trace limitation note.

**Verification:** All 6 cards render with correct names + file paths. Per-card hover content matches ARCHITECTURE.md table.

---

- U6. **Slide 5 — Threat Coverage heat map**

**Goal:** Render the 10-category threat model as a 3-state heat map with T0-baseline framing and projected-state legend.

**Requirements:** R9

**Dependencies:** U10 (panel infrastructure)

**Files:**
- Modify: `docs/architecture-deck.html` (Slide 5 SVG content)

**Approach:**
- **Slide header inside canvas:** "Coverage at T0 — pre-eval-suite. Phase 6 populates." (16px Inter, muted color, top-center of canvas).
- Layout: 10 cells in a 5×2 grid for the 10 primary categories. Cells fill at 220px wide × 150px tall.
- Each cell: category name (header) + state-fill color (3 states: covered / partial / not-covered). At commit `4f09569`, all 10 cells fill as **Not-covered** (light gray) — the eval suite is genuinely not built yet.
- **Projected-state legend** to the right of the grid (muted treatment): "Phase 6 target: 4 covered (sage green), 4 partial (muted amber), 2 not-covered (light gray)" — demonstrates the tracking concept visually rather than narratively, so the slide is self-defending without verbal support.
- **Persona-hijacking footnote** below the 5×2 grid (12px font, low visual weight): "Low-priority — session-bound identity (`app/auth/scope.py`) neutralizes most prompt-based variants; rendered as footnote rather than primary cell."
- Bottom-of-slide text: "Full table → ARCHITECTURE.md §Threat Model Scope" (12px, plain text).
- Hover any cell: panel shows category + Initial defense signal from ARCHITECTURE.md. No rationale text per brainstorm F8.

**Test scenarios:**
- *Happy path* — All 10 cells render with category names. T0 header visible. Projected-state legend visible. Persona-hijacking footnote present below grid.
- *Happy path* — Hover Direct prompt injection cell. Panel surfaces "Initial defense signal: System prompt, refusal policy, role checks."
- *Edge case* — Verify no rationale text appears in any panel.

**Verification:** Heat map renders 10 cells + persona-hijacking footnote + T0 header + projected-state legend. Hover content matches ARCHITECTURE.md.

---

- U7. **Slide 6 — Data Contracts**

**Goal:** Render the four data contracts as a linear-chain diagram with Red Team / Judge as intermediate agents and the Message Envelope as a surrounding frame. Use a transparent-overlay-rect for the Envelope frame hover target.

**Requirements:** R10

**Dependencies:** U10 (panel infrastructure)

**Files:**
- Modify: `docs/architecture-deck.html` (Slide 6 SVG content)

**Approach:**
- Layout: top row left-to-right: AttackCase card → AttackAttempt card → JudgeVerdict card, with directional arrowheads between each. Middle row: Red Team (smaller card) between AttackCase and AttackAttempt; Judge (smaller card) between AttackAttempt and JudgeVerdict. Surrounding all five: Message Envelope as a labeled rounded-rectangle frame with "Message Envelope" label anchored at the top-left of the frame.
- Each card carries `data-contract-id`. Hover surfaces short description + plain-text reference to ARCHITECTURE.md `## Data Contracts > <subsection>`.
- **Envelope frame hover target:** the visible frame border is a `<rect>` with stroke. The hover hit-target is a separate transparent `<rect>` 12px inset from the frame boundary with `fill: transparent` and `pointer-events: all`. Both rects share rounded-corner geometry. Reliable hit target at any cursor speed.
- No field-level schema duplicated in the deck.

**Test scenarios:**
- *Happy path — Covers AE5.* Hover the AttackCase card. Panel shows AttackCase role + "See ARCHITECTURE.md §Data Contracts > AttackCase". No field-level schema in the panel.
- *Happy path* — Hover the Envelope frame (border region or just inside it). Panel surfaces Envelope description.
- *Edge case* — Hover the Envelope frame stroke directly (1–2px line). Verify the transparent overlay-rect makes the hit-target reliable (no need to land on the stroke itself).

**Verification:** Linear chain layout matches R10 spec. Envelope frame hover works reliably via the overlay rect. AE5 passes.

---

- U8. **Font subsetting + base64 inlining (split from U1)**

**Goal:** Subset Source Serif Pro, Inter, JetBrains Mono to Latin-only WOFF2; base64-encode; inline as `@font-face` data URIs in the HTML's `<style>` block. Fall back to system fonts if the time-box is exceeded.

**Requirements:** R16

**Dependencies:** U1 (HTML scaffolding to write @font-face into)

**Files:**
- Modify: `docs/architecture-deck.html` (adds `@font-face` declarations + data URIs to existing `<style>` block)

**Approach:**
- Source WOFF2 originals from pinned URLs:
  - Source Serif Pro (Regular + Bold): `github.com/adobe-fonts/source-serif/raw/release/WOFF2/TTF/` (or equivalent path; verify at download time)
  - Inter (Regular + Bold): `github.com/rsms/inter/raw/master/docs/inter.css` references → grab the static WOFF2 files
  - JetBrains Mono (Regular + Bold): `github.com/JetBrains/JetBrainsMono/raw/master/fonts/webfonts/`
- Subset each WOFF2 to Latin-only glyph range using `fonttools` (Python: `pyftsubset font.woff2 --output-file=font-subset.woff2 --unicodes=U+0020-007E,U+00A0-00FF --flavor=woff2 --layout-features=kern`). Or use `glyphhanger` if Node is preferred.
- Base64-encode each subsetted file: `base64 -w 0 font-subset.woff2 > font-subset.b64`. Inline into `@font-face` `src: url(data:font/woff2;base64,...)`.
- **Time-box: 2 hours total for all three families.** If exceeded or any glyph coverage breaks (missing apostrophe, em-dash, ligature), fall back to system-font stack:
  - Body sans: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  - Headings serif: `"Iowan Old Style", "Apple Garamond", Baskerville, Georgia, serif`
  - Monospace: `ui-monospace, "SF Mono", Consolas, "Liberation Mono", monospace`
- Document the deviation in the version-stamp comment block if fallback path is taken: "R16 typography compromise: system-font stack in lieu of inlined Source Serif Pro / Inter / JetBrains Mono."

**Test scenarios:**
- *Happy path* — Open deck after fonts inlined. Inspect H1 in DevTools → Computed → font-family resolves to Source Serif Pro (not the system fallback). File size remains under 600 KB.
- *Fallback path* — If time-box exceeded, fall back; verify deck still renders cleanly with system fonts; version-stamp comment documents the deviation.

**Verification:** Either inlined custom fonts work (verified via DevTools) or system-font fallback is documented in the version-stamp comment.

---

- U9. **Panel HTML/CSS + R12 content transcription (split from U2)**

**Goal:** Build the right-rail side panel HTML/CSS layout. Populate the `COMPONENT_PANEL_CONTENT` JS object literal with ~90 R12-schema text fragments extracted from ARCHITECTURE.md.

**Requirements:** R11 (panel layout portion), R12 (content)

**Dependencies:** U2 (component IDs to key against)

**Files:**
- Modify: `docs/architecture-deck.html` (adds panel HTML + panel CSS + JS content object)
- Create: `docs/plans/2026-05-12-001-panel-content-inventory.md` (scratch file — 15 components × 6 fields × ARCHITECTURE.md line references)

**Approach:**
- **Prerequisite step: build the content-inventory scratch file first.** Create `docs/plans/2026-05-12-001-panel-content-inventory.md` listing 15 components, with one section per component containing 6 R12 fields (purpose, trust tier, inputs, outputs, allowed tools, denied tools, failure modes) and ARCHITECTURE.md line references for each. Verify completeness as data before SVG/HTML consumes attention.
- **Time-box: 4 hours for the inventory step.** If exceeded, scope-cut by trimming 2–3 fields per service component (e.g., drop "allowed tools"/"denied tools" for services where ARCHITECTURE.md's Platform Services section is brief). Keep all 6 fields for the 4 agents.
- Panel HTML: `<aside id="panel" data-mode="hidden">` with `<header>` (component name + trust-tier color swatch + pin icon placeholder), `<dl>` (six R12 fields as labeled `<dt>` / `<dd>` pairs).
- Panel CSS: when `[data-mode="open"]`, panel slides in (transform translateX) + canvas shrinks via grid layout. 720px min-width breakpoint per R11 / U1's docked-mode rule.
- JS content object: `const COMPONENT_PANEL_CONTENT = { "orchestrator": { purpose: "...", trust_tier: "medium", inputs: [...], outputs: [...], allowed_tools: [...], denied_tools: [...], failure_modes: [...] }, ... }`. 15 entries (4 agents + 3 services + Target Adapter + Slack + Security Console + FastAPI Control Plane + 3 storage + Observability + Target).
- Canonical naming rule per R12: "Campaign Runner" in visible labels; `pydantic_graph.Graph` only in implementation-notes contexts. "Pydantic Graph Campaign Runner" never appears.

**Test scenarios:**
- *Happy path — Covers AE6 (sampled).* Pick 5 random components per slide and verify their panel content matches ARCHITECTURE.md at commit `4f09569` verbatim or as faithful abbreviation. Not exhaustive — sampled.
- *Happy path* — Inventory scratch file is present with 15 component sections + 6 fields each + line references.

**Verification:** Content inventory scratch file complete. Panel HTML/CSS renders correctly. AE6 sampled spot-checks pass.

---

- U10. **Hover-dim + side-panel state machine (split from U2)**

**Goal:** Wire vanilla JS hover handlers for SVG nodes and edges. Implement panel show/hide via the `hover_target` state field. Implement hover-dim behavior.

**Requirements:** R11, R12 (edge schema), R13 (panel-persist-into-rail)

**Dependencies:** U2 (SVG nodes with data attributes), U9 (panel HTML + content object)

**Files:**
- Modify: `docs/architecture-deck.html` (adds JS hover handlers + CSS hover-dim rules)

**Approach:**
- Initialize the page-level `state` object (per High-Level Technical Design).
- Hover handlers via event delegation on the SVG: `mouseover` on a node sets `state.hover_target`; `mouseout` to non-panel, non-node clears it. Render function reads state and applies `data-hover-active="<id>"` to SVG root.
- CSS dim rule: `[data-hover-active] [data-component-id]:not([data-hover-active="self"]):not([data-source="<id>"]):not([data-target="<id>"]) { opacity: 0.25; transition: opacity 150ms; }`.
- Connection highlight: edges with `[data-source="<id>"]` or `[data-target="<id>"]` retain full opacity.
- Persist-into-panel rule (R13 partial): cursor moving from a component node into the side panel does NOT trigger hover-off. Panel persists. Implemented via `mouseenter`/`mouseleave` on the panel element interacting with the state field.
- Edge panel schema (R12 edge case): when `hover_target` is an edge, panel shows relationship label + source/target trust tiers + boundary notes (evidence wrapper, approval gate, etc.).

**Test scenarios:**
- *Happy path — Covers AE1.* Hover Red Team node. All other nodes/edges fade to 0.25 opacity. Red Team's inbound/outbound edges stay full opacity. Panel fills with Red Team's R12 content.
- *Happy path — Covers AE2.* Move cursor to empty canvas. Panel clears; opacity restores.
- *Happy path* — Move cursor from a hovered node into the panel. Panel persists (does not clear).
- *Edge case* — Hover an edge with `data-source="red-team"` `data-target="target-adapter"`. Panel shows edge schema (relationship label, source/target tiers, boundary notes).

**Verification:** AE1 + AE2 pass. Edge-hover surfaces the edge schema. Persist-into-panel works.

---

- U11. **Click-to-lock + right-arrow precedence + composition rules (split from U3)**

**Goal:** Layer the click-to-lock state machine and the slide-2 right-arrow precedence onto the state object. Enforce R5 composition rules (c), (d), (e) via the render priority.

**Requirements:** R13 (click-to-lock + state machine), R14 (right-arrow precedence), R5 (composition rules c/d/e)

**Dependencies:** U3, U10

**Files:**
- Modify: `docs/architecture-deck.html`

**Approach:**
- **Click-to-lock affordance:** clicking a node sets `state.locked_target`. Render: pin icon in panel header becomes filled; teal accent border on panel.
- **Pin icon implementation:** inline SVG symbols mirroring Heroicons map-pin set. Two symbols defined once in `<defs>`: `<symbol id="pin-outline">` (outlined variant) and `<symbol id="pin-solid">` (filled variant). Referenced via `<use href="#pin-outline">` (default) or `<use href="#pin-solid">` (locked). Fill controlled by CSS `fill: var(--teal)`.
- **State-machine transitions:** locked-state takes precedence over hover (render priority: locked > hover). While locked, hovering a different node does NOT swap panel content. Clicking a different node releases the lock and locks onto the new node. Pressing Escape or clicking the pin icon releases the lock; click-to-empty-canvas also releases.
- **Right-arrow precedence on Slide 2:** ArrowRight on Slide 2 advances `state.active_step` until 13, then advances slide-nav to Slide 3. ArrowLeft mirrors.
- **Composition rules:**
  - (c) Hover overrides lifecycle highlight (rendered separately so they coexist visually; hover-dim takes effect while lifecycle path remains at its current opacity for the active step).
  - (d) Lifecycle advances regardless of a click-locked panel; locked panel content does not change as lifecycle steps progress.
  - (e) Slide navigation away resets `hover_target` and `locked_target` (clears panel and lock state); preserves `active_step` and `trust_mode` per U3.

**Test scenarios:**
- *Happy path — Covers AE7.* Click Red Team. Pin filled, teal border, panel shows Red Team. Hover Judge — panel content unchanged (lock wins). Click Judge — lock transfers; panel updates to Judge; pin stays filled. Press Escape — pin returns to outlined; teal border removed.
- *Edge case — composition rule (c).* Hover Red Team while at lifecycle step 7. Verify hover-dim takes effect; lifecycle step 7 stays highlighted at its prior opacity.
- *Edge case — composition rule (d).* Click-lock Red Team. Click step-forward. Lifecycle advances; lock stays.
- *Edge case — composition rule (e).* Click-lock Red Team at step 7 in Trust-tiers mode. Navigate to Slide 3. Navigate back. Lock cleared; `active_step` still 7; trust-tier mode still active.
- *Edge case — right-arrow precedence.* On Slide 2 at `active_step = 5`, press ArrowRight. `active_step` → 6. Press 7 more times. Reaches 13. Press once more — advances to Slide 3.

**Verification:** AE7 passes. Composition rules (c), (d), (e) all hold. Right-arrow precedence fires correctly.

---

## System-Wide Impact

- **Interaction graph:** Single page-level state object holds all interactive state. State mutations cascade to render via a render function called on every change. Entry points: keyboard handlers (ArrowLeft/Right, "T", Escape), mouse handlers (hover/click), button handlers.
- **Error propagation:** Browser-only. Any JS error fails the slide silently. Wrap state mutations in try/catch; log to `console.error`.
- **State lifecycle risks:** Hover and lock state reset on slide navigation away (per R5 composition rule e); lifecycle state and trust-tier-mode preserve across navigation. HTML reload resets everything. No persistence.
- **API surface parity:** No external APIs; everything in-document.
- **Integration coverage:** Cross-slide consistency for panel layout, click-to-lock, hover-dim across Slides 2, 4, 5, 6. Slide 3 uses a distinct participant schema. Slide 1 has no panel.
- **Unchanged invariants:** Plan creates one new deck artifact + one scratch file under `docs/plans/`; existing repo files unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Inlined base64 fonts inflate the HTML file to several MB | Latin-only subset; Regular + Bold weights only; budget ~400 KB total |
| Font subsetting toolchain unfamiliar or breaks on edge cases | Pinned source URLs in U8; 2-hour time-box; system-font fallback documented in U8 |
| SVG hand-positioning labor underestimated | U2 + U4 carry starter coordinate tables; 60-min time-box per slide; if exceeded, ship rough layout and polish post-defense |
| Lifecycle animation feels janky in any browser | 150ms opacity-only transitions; manual cross-browser test logged in Verification Log |
| Panel content drift from ARCHITECTURE.md mid-implementation | Stamp commit `4f09569`; treat that commit as authoritative; do NOT re-read newer commits during build |
| Hover semantics break under trackpad use during demo | Demo Rehearsal row in Verification Log tests on demo laptop; click-to-lock is the click-first fallback if hover proves unreliable |
| Color-blind viewer in Defense audience can't distinguish trust tiers | Acknowledged limitation; verbal narration during defense (per brainstorm F13 Skip) |
| Slide 5 cells all in Not-covered state misread as broken | T0-baseline header + projected-state legend bake the framing into the slide visually (per U6) |
| Implementer chooses font weight or color hex that violates arXiv aesthetic | Browser eye-test against arXiv typography anchor during U1 verification |
| Self-signoff under build-week pressure leads to skipped checks | Verification Log at bottom of plan with checkbox row per unit + Demo Rehearsal row; engineer ticks per-unit with date |

---

## Documentation / Operational Notes

- The version-stamp comment block at the top of the HTML file documents both source commits + the diagram-authoritative-at-stamp-time note. Downstream consumers can verify panel content against ARCHITECTURE.md at that commit using `git show 4f09569:ARCHITECTURE.md` (pipe to a pager or write to a scratch file; do not compare against the working tree if any local edits have landed).
- Once the boundary-labs README is authored (separate work, out of scope), add a link to `docs/architecture-deck.html` from the README's documentation section.
- The deck is a single-use defense-day artifact. Patterns worth lifting forward for any future deck: the state-priority render order (locked > hover > idle), the `data-step` lifecycle attribute pattern, the two-source version-stamp model. The hand-positioned coordinates and per-slide custom panel schemas are NOT reusable; future decks should rebuild from scratch.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-12-interactive-architecture-deck-requirements.md](../brainstorms/2026-05-12-interactive-architecture-deck-requirements.md)
- **Text source:** `ARCHITECTURE.md` at commit `4f09569`
- **Diagram source:** `FIX_PLAN.md` at commit `4f09569` (Figure 1/Figure 2 layout, trust palette, WU-23 sequence diagram)
- **Assignment context:** `assignment.md` (Gauntlet AI Week 3 PRD)

---

## Verification Log

Engineer-author ticks each row as the unit's manual verification scenarios pass. Use ISO date (YYYY-MM-DD) and a one-line note (e.g., commit SHA, browser tested, blocking issue if any).

| Unit | Verified? | Date | Notes |
|------|-----------|------|-------|
| U1   | ☐         |      |       |
| U2   | ☐         |      |       |
| U3   | ☐         |      |       |
| U4   | ☐         |      |       |
| U5   | ☐         |      |       |
| U6   | ☐         |      |       |
| U7   | ☐         |      |       |
| U8   | ☐         |      |       |
| U9   | ☐         |      |       |
| U10  | ☐         |      |       |
| U11  | ☐         |      |       |
| **Demo Rehearsal** | ☐ |    | Full slide sequence run twice end-to-end on the demo laptop, in the demo browser, narrating aloud. Fonts loaded; hover semantics work on trackpad; click-to-lock pin icon visible at projector resolution; all keyboard shortcuts (T, Escape, arrows) responsive. **Complete at least 4 hours before defense gate.** |
