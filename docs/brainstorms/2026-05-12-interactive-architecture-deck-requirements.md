---
date: 2026-05-12
topic: interactive-architecture-deck
---

# Interactive Architecture Deck

## Summary

A self-contained HTML deck — six slides — that doubles as the Architecture Defense surface and a future-you live-walkthrough reference for the boundary-labs platform. Clean-academic visual style anchored to arXiv preprint typography. The campaign lifecycle animates as a narrative spine on the main system canvas (Slide 2), with a trust-tier toggle on the same canvas; four adjacent slides cover the approval flow, target attack surface, threat coverage, and data contracts. Every component is hoverable to dim the rest of the canvas, trace its connections, and surface a right-rail side panel with structured detail you'd otherwise have to memorize. The deck is version-stamped to a named ARCHITECTURE.md commit and is a defense-day artifact (drift acceptable after).

---

## Problem Frame

The boundary-labs platform spans seven core components (four agents, three Platform Services), a Target Adapter, a Slack approval surface, a control plane, three storage backends, an observability layer, and a target system — wired through a campaign lifecycle (Campaign Runner driven), an Evidence Wrapper boundary, a Slack HITL approval loop, and a five-tier trust model. The full picture lives in `ARCHITECTURE.md` as a 1,200-line prose document optimized for the implementing engineer.

That doc is not the right surface for two adjacent jobs the engineer needs to do. The first is the Architecture Defense gate four hours after kickoff — a live walkthrough where the grader expects to see the design at a glance, follow connections by pointing at them, and probe specific trust boundaries on demand. Scrolling 1,200 lines of prose under time pressure fails that mode. The second is future-you walkthroughs during the rest of the build — opening the doc mid-implementation to recover a committed decision, or showing the platform to a collaborator who hasn't read the whole thing. Both jobs need a hoverable interactive surface where the architecture's connections are visible by default and the detail is one cursor-movement away.

No artifact like this exists yet. `ARCHITECTURE.md` references `docs/protective-security-agent-architecture.html` and a slideshow path aspirationally, but `docs/` doesn't exist in the repo.

---

## Actors

- A1. **Engineer-author (future-you).** Builds boundary-labs. Opens the deck during demos, defense walkthroughs, and collaborator conversations. Reads it while implementing, when needing to recover a committed decision or trust-boundary rationale visually rather than by scrolling prose.
- A2. **Architecture Defense grader.** Watches a live walkthrough four hours after kickoff. Probes specific decisions: why is the agent that generates attacks not the one that judges them, what's behind the Slack approval gate, what does the Target Adapter actually do. Needs to follow connections in real time.
- A3. **Demo viewer.** Mixed-technical audience seeing the platform for the first time during the Friday demo. Watches the engineer-author drive; doesn't drive themselves.

---

## Key Flows

- F1. **Live architecture walkthrough.**
  - **Trigger:** Engineer-author opens the deck during the Defense session or demo.
  - **Actors:** A1 drives, A2 / A3 watches.
  - **Steps:** (1) Open at slide 1 (title + elevator pitch). (2) Advance to slide 2 (system map); narrate the campaign lifecycle as it animates as an overlay path; toggle to trust-tier coloring on the same canvas if probed on separation of duties. (3) Hover any component to dim the rest of the canvas, highlight its connections, and surface its detail card in the right rail. (4) Advance to adjacent slides on demand based on grader/viewer questions (slide 3 approval flow if probed on Slack HITL, slide 4 target attack surface if probed on what's being attacked, slide 5 threat coverage if probed on what's covered, slide 6 data contracts if probed on schemas).
  - **Outcome:** Grader can verify every architectural decision is named, located on a diagram, and connected to its rationale; viewer leaves with a mental model of how a campaign flows.
  - **Covered by:** R1, R2, R4, R5, R7, R8, R9, R10, R11, R12, R13, R15.

- F2. **Solo reference lookup.**
  - **Trigger:** Engineer-author is mid-implementation and needs to recover a committed decision — e.g., "what's the Judge's denied-tools list" or "what does the Safety Gate Service take as input."
  - **Actors:** A1.
  - **Steps:** (1) Open the deck. (2) Navigate to whichever slide carries the relevant component (system map for agents/services, target attack surface for endpoints, data contracts for schemas). (3) Hover the component. (4) Read the detail card. (5) Close.
  - **Outcome:** Engineer-author recovers the committed decision without opening `ARCHITECTURE.md`.
  - **Covered by:** R3, R4, R5, R14, R15.

---

## Requirements

The deck is specified in 16 requirements grouped into five concerns: Deliverable shape (R1–R3), Slide composition (R4, R5, R7–R10, six slides; R6 was removed in favor of a Slide-2 toggle), Hover interaction (R11–R13), Navigation (R14–R15), Visual style (R16–R17). R-IDs are kept stable across revisions to preserve AE cross-references; the R6 gap is intentional.

**Deliverable shape (3 requirements)**

- R1. The deck is a single self-contained HTML file checked into the boundary-labs repo under a stable path inside `docs/`.
- R2. The deck loads and renders correctly when opened directly in a modern desktop browser without a server, package install, or build step required of the viewer.
- R3. The deck has two content sources with explicit roles, both version-stamped. Textual content (component purpose, inputs/outputs, tools, failure modes, threat-model entries, contract descriptions) is sourced from `ARCHITECTURE.md` at a named commit. Diagram structure (Figure 1 / Figure 2 split, node-shape vocabulary, trust palette, sequence-diagram layout, lifecycle step count) is sourced from `FIX_PLAN.md` at a named commit until the relevant WUs (WU-9a, WU-9b, WU-10, WU-23, WU-25a) land in ARCHITECTURE.md; after that, ARCHITECTURE.md becomes the canonical source for diagrams as well. During the gap, the deck leads ARCHITECTURE.md on diagrams. The version-stamp comment block at the top of the deck file names BOTH commits and a one-line note about which source was diagram-authoritative at stamp time. Where the two sources conflict on the same fact (e.g., FIX_PLAN.md WU-9b validates an 11-step lifecycle while ARCHITECTURE.md enumerates 13 steps), ARCHITECTURE.md's wording is authoritative for the deck and the FIX_PLAN WU is treated as needing update at land-time. The deck does not introduce new architectural decisions in either source; it surfaces the existing ones visually.

**Slide composition (6 requirements; six slides total)**

- R4. **Slide 1 — Title.** Names the platform (boundary-labs / Protective Security Agent), states what it does in 1–2 sentences (the elevator pitch), and identifies the target (Clinical Co-Pilot in OpenEMR).
- R5. **Slide 2 — System Map.** Renders the full system architecture as a single canvas using the FIX_PLAN's Figure 1 + Figure 2 design language (Figure 1: system context with the Campaign Agents cluster collapsed as a single block; Figure 2: Campaign Agents' internal nodes — Orchestrator, Red Team, Judge, Documentation, plus Coverage Scoring Service, Regression Promotion Service). Components on the canvas: humans (Operator, Security Console, Slack), Control Plane (FastAPI, Safety Gate Service, Campaign Runner), Campaign Agents cluster (per Figure 2), Target Adapter, Target (Clinical Co-Pilot), Storage (Security App DB, Artifact Store, Audit Ledger, Queue), Observability Layer (Logfire / OpenTelemetry).

  *Lifecycle overlay.* The campaign lifecycle animates as an overlay path on the same canvas, advancing step-by-step through 13 lifecycle steps. The 13-step count is authoritative and overrides FIX_PLAN.md WU-9b's 11-step validation criterion (ARCHITECTURE.md is canonical for the textual lifecycle definition; WU-9b's validation needs updating to 13 when WU-9b lands). Lifecycle step state persists across slide navigation within a session — advancing to another slide and returning to Slide 2 restores the last active step. HTML reload resets to no step highlighted.

  *Step-forward control.* A persistent on-canvas toolbar lives at the top-right corner of the canvas. It contains a step-forward button paired with a step counter ("N / 13"). At step 13 the button transitions to a "Replay" affordance (circular-arrow icon) that restarts at step 1. Right-arrow precedence rule: on Slide 2, right-arrow advances the lifecycle overlay until step 13, then subsequent right-arrows advance to slide 3; left-arrow reverses the lifecycle until step 1, then subsequent left-arrows reverse to slide 1. The on-canvas step-forward button always advances the lifecycle regardless of slide-navigation state.

  *Trust-tier toggle.* The top-right toolbar also carries a labeled toggle button with two states ("Base" / "Trust tiers") and an active-mode visual treatment (filled when active vs outlined when inactive). Keyboard shortcut "T" toggles. When "Trust tiers" is active, node coloring and the legend overlay swap to foreground the five-tier trust palette (untrusted / low / medium-low / medium / high) without changing node positions.

  *Composition rules across the four interaction systems on Slide 2.* (a) Trust-tier toggle preserves lifecycle step on activation/deactivation — toggling only changes node coloring and the legend, not lifecycle state. (b) Hover panel content uses the R12 general-component schema in both Base and Trust-tier modes; in Trust-tier mode the trust tier appears with the appropriate color swatch. (c) Hover overrides lifecycle highlight; when the cursor returns to empty canvas, the lifecycle restores its last active step at previous opacity. (d) Lifecycle advances regardless of a click-locked panel — a locked panel stays pinned while the lifecycle step changes underneath. (e) Hover / lock / lifecycle / toggle states all reset on slide navigation away and persist on return (per the lifecycle-state rule above).
- *(R6 retired — replaced by the trust-tier toggle on Slide 2 per R5.)*
- R7. **Slide 3 — Approval Flow.** Renders the WU-23 approval sequence diagram: Operator → Slack → API → Safety Gate Service → Campaign Runner → Audit Ledger, including the TTL auto-reject branch and the post-approval revalidation step. Numbered steps so prose elsewhere can reference them. The slide-3 participant-panel schema (distinct from the R12 node panel) is: approval-loop role (one sentence), messages sent (list with target participant), messages received (list with source participant), decision criteria, TTL/failure behavior.
- R8. **Slide 4 — Target Attack Surface.** Diagrams the Clinical Co-Pilot's exposed surfaces (`/conversation` SSE, `/copilot/ingest`, `/copilot/documents`, SMART launch, source-document endpoint, internal token boundary) as a focused diagram with one card per surface; hovering reveals the specific attacks each surface gets (cross-references the ARCHITECTURE.md `Target-Specific Attack Surface From Repo Research` section).
- R9. **Slide 5 — Threat Coverage.** Renders the 10-category threat model as a coverage heat map (one cell per category, three states: covered / partial / not-covered) with a link to ARCHITECTURE.md's `Threat Model Scope` section for the full attack-surface/impact/difficulty/defense-signal table. Hovering a category reveals its one-line summary sourced from the existing ARCHITECTURE.md table (category name plus Initial defense signal).
- R10. **Slide 6 — Data Contracts.** Shows AttackCase, AttackAttempt, JudgeVerdict, and the Message Envelope as visual cards. Layout: linear chain left-to-right with the three contract cards on the top row (AttackCase → AttackAttempt → JudgeVerdict, with directional arrowheads); the two agents that consume/produce them (Red Team between AttackCase and AttackAttempt; Judge between AttackAttempt and JudgeVerdict) rendered on a middle row, smaller. The Message Envelope is rendered as a labeled rounded-rectangle frame surrounding all five cards. Hovering a card surfaces a short description and a link to the corresponding ARCHITECTURE.md `Data Contracts` subsection for the full schema. Field-level expansion is not duplicated in the deck.

**Hover interaction (3 requirements)**

- R11. Hovering any component (an agent, a service, a graph node, a storage backend, a connection, a target surface, a category cell, a contract card) dims the rest of the canvas, highlights the hovered component's inbound and outbound connections, and fills a right-rail side panel with structured content for that component. Panel layout rule: the panel slides in from the right and shrinks the canvas to a minimum 720px width; below that breakpoint, the panel docks below the canvas in a split layout. When the canvas enters docked-below mode (canvas width < 720px), the lifecycle overlay scales proportionally to fit the new canvas viewport; the step-forward button and counter remain visible; lifecycle annotations may use smaller text to fit. Hover-dim and panel content behavior is unchanged.
- R12. The side panel's content schema depends on what was hovered. For a system component (agent, service, storage, control-plane element): purpose (one sentence), trust tier with color swatch, inputs, outputs, allowed tools, denied tools (when applicable), known failure modes. For an edge or connection: relationship label, source trust tier, target trust tier, boundary notes (evidence wrapper, approval gate, ETL boundary, etc.) that apply to that edge. Hover panels and visible labels use canonical names: "Campaign Runner" for the role, `pydantic_graph.Graph` only inside implementation-notes contexts (not on the canvas, not in panel headers). The compound "Pydantic Graph Campaign Runner" does not appear in any visible deck text. Content is sourced from `ARCHITECTURE.md` and abbreviated for the panel; the panel does not duplicate the entire ARCHITECTURE.md section.
- R13. Hover-off restores the canvas to its rest state with no lingering highlight or panel content. Moving the cursor from a component node into the side panel does NOT trigger hover-off — the panel persists until the cursor moves to empty canvas or a different component node.

  *Click-to-lock affordance.* Clicking a component pins the current panel. The locked state is visually distinct: a pin icon appears in the panel header (outlined when unpinned, filled when pinned) and a thin teal accent border surrounds the panel while locked. Release on (a) clicking the pin icon, (b) clicking an empty canvas region, or (c) pressing Escape. Keyboard-focus-as-hover-equivalent is supported via the click-to-lock interaction (tabbing to a node and pressing Enter or Space triggers the lock).

  *Click-to-lock state machine.* Locked state takes precedence over hover. While locked, hovering a different node does NOT swap panel content. Clicking a different node releases the lock and locks onto the new node. Pressing Escape or clicking the pin icon releases the lock and returns to idle. Click-to-empty-canvas also releases the lock and returns to idle.

**Navigation (2 requirements)**

- R14. The deck supports keyboard navigation (left / right arrow keys advance and reverse slides) and click navigation (a visible slide index or prev/next affordance).
- R15. A visible slide index shows slide number AND title (e.g., "1 — Title", "2 — System Map", "3 — Approval Flow", "4 — Target Attack Surface", "5 — Threat Coverage", "6 — Data Contracts"). Titles match the slide-composition group headers in R4–R10.

**Visual style (2 requirements)**

- R16. Visual style is clean-academic, anchored to the typographic weight and whitespace of an arXiv preprint. Use a transitional serif (e.g., Source Serif Pro) for headings and a humanist sans (e.g., Inter) for body; monospace (e.g., JetBrains Mono) for identifiers and code spans. Background white or off-white; accents navy and teal; muted trust-tier colors that fit the palette rather than fully saturated. Motion is opacity-only, max 150ms, no transform or scale animations.
- R17. The deck reuses the FIX_PLAN's design conventions: five-tier trust palette (red / light-red / pink / blue / green, muted), node shape vocabulary (rectangle = LLM agent, hexagon = deterministic service, cylinder = storage, asymmetric = queue), the Figure 1 / Figure 2 split between system context and campaign execution flow, and the labeled lifecycle steps.

---

## Acceptance Examples

- AE1. **Covers R11, R12.** Given the deck is open at slide 2 (system map), when the engineer-author hovers the Red Team agent node, then every node and edge in the canvas that is not Red Team or directly connected to Red Team dims; Red Team's inbound edge from Orchestrator and outbound edge to Target Adapter remain at full opacity; the right-rail side panel fills with Red Team's purpose, trust tier ("untrusted"), inputs (Orchestrator task packet, category seed cases, prior attempts), outputs (AttackCase drafts, AttackAttempt transcripts, mutation lineage), allowed tools (create attack draft, mutate, execute through Target Adapter, read seed cases), denied tools (direct network access outside allowlist, secrets, judge its own attempts, write reports), and known failure modes (low-novelty variants → redirect category).

- AE2. **Covers R13.** Given the engineer-author was hovering the Red Team node and the side panel shows Red Team's detail, when the cursor moves off the Red Team node onto empty canvas, then the side panel clears, all dimmed nodes return to full opacity, and the highlighted edges return to default styling.

- AE3. **Covers R5.** Given the deck is at slide 2 (system map) with the lifecycle overlay not yet animated, when the engineer-author presses the step-forward control, then the lifecycle's first step (Operator requests a campaign from the Security Console) highlights as an annotated path on the canvas; subsequent presses advance through the remaining 12 lifecycle steps; the rest of the canvas remains visible at reduced emphasis so the viewer sees both "where we are" and "the full system" simultaneously.

- AE4. **Covers R7.** Given the deck is at slide 3 (approval flow), when the engineer-author hovers a participant (e.g., Safety Gate Service) in the sequence diagram, then every message that originates from or terminates at Safety Gate Service is highlighted, and the side panel surfaces the slide-3 participant schema for Safety Gate Service: approval-loop role, messages sent, messages received, decision criteria, TTL/failure behavior — distinct from the slide-2 R12 node panel.

- AE5. **Covers R10.** Given the deck is at slide 6 (data contracts), when the engineer-author hovers the AttackCase card, then the panel shows a one-paragraph description of AttackCase's role (a test case the Red Team executes) plus a link to the ARCHITECTURE.md `Data Contracts > AttackCase` subsection for the full schema. The deck does not duplicate field-level schema content.

- AE6. **Covers R3, R12.** Given the deck quotes the Judge agent's denied-tools list and the deck file declares the ARCHITECTURE.md commit it tracks (at the top of the file per Dependencies), when the engineer-author compares the panel content against ARCHITECTURE.md AT THAT COMMIT, then the wording matches the doc verbatim or is a faithful abbreviation; no denied tool appears in the panel that is not in the doc at that commit, and no denied tool from the doc at that commit is silently omitted from the panel. Sync is scoped to the stamped snapshot, not to the moving doc.

- AE7. **Covers R13.** Given the engineer-author has click-locked the panel on the Red Team node (the pin icon shows filled and the panel has a teal accent border), when the cursor moves to hover the Judge node, then the panel content does NOT change — it stays on Red Team. When the engineer-author clicks the Judge node, then the lock releases from Red Team and locks onto Judge (the panel updates to Judge's R12 content; the pin icon stays filled). When the engineer-author then presses Escape, then the lock releases (pin icon outlined, teal border removed, panel returns to whatever the current hover state is; if no hover, panel clears).

---

## Success Criteria

- The engineer-author can run a live walkthrough of the platform in front of the Architecture Defense grader without scrolling `ARCHITECTURE.md` and without having to memorize per-component detail in advance.
- A grader probing any agent or service, the trust boundary rationale (via Slide 2's trust-tier toggle), the approval flow, the target attack surface, the threat coverage state, or the data contracts can be answered by hovering the relevant element and reading the panel.
- The deck stays in sync with `ARCHITECTURE.md` at the commit named in the deck's version-stamp comment block. For any field shown in a side panel as of that snapshot, the wording is recoverable in the doc at that commit. Drift after the Architecture Defense is acceptable; the deck is a defense-day artifact, not a living surface maintained across the build week.
- The deck loads in a modern desktop browser by double-clicking the HTML file. No server, no build step, no dependency install required of the viewer.
- A downstream implementer reading this requirements doc can plan the build (slide-by-slide content, hover interaction, navigation, styling) without inventing product behavior, slide composition, or hover semantics — only how to implement those decisions in code.

---

## Scope Boundaries

- Build plan timeline slide. Useful but not in v1.
- Open Decisions slide.
- A "quiet ↔ explore" mode toggle. Single mode only — hover effects always on.
- Speaker notes or presenter view.
- Multiple themes, dark mode, or theme toggle.
- Print or PDF export.
- Embedding live runtime data from a running campaign. The deck is a static defense surface, not a runtime dashboard.
- Editing affordances on the diagrams. The deck is read-only.
- A mobile or touch-optimized layout. Desktop browser only; touch-first interactions are not designed for.
- Server-side rendering, SSR hosting, or any non-static deployment.
- Cross-deck navigation, search, or full-text indexing.
- Implementation choice (vanilla HTML/CSS/JS vs framework, hand-rolled SVG vs Mermaid-live vs library-rendered). Decided in planning, not here.

---

## Key Decisions

- **Audience is future-you / live walkthrough, not the doc reader.** The deck doesn't replace `ARCHITECTURE.md` — it surfaces the doc's connections for a different reading mode. Doc stays as the builder's reference; the deck is the interactive defense surface.
- **Hybrid outline: campaign lifecycle as spine, hover-zoom for architectural detail.** Lifecycle gives the deck a story; hover-zoom gives it reference-mode usefulness during a defense or solo lookup. Lifecycle animates as an overlay on the main system canvas rather than as separate slides.
- **Hover and lifecycle coexist with hover taking precedence.** When the cursor returns to empty canvas, the lifecycle restores its last active step at previous opacity. Hover-panel content stays general-component (not lifecycle-step-specific). Product decision; settled here, not in planning.
- **Six slides, not seven.** Title; System Map (with lifecycle overlay + trust-tier toggle); Approval Flow; Target Attack Surface; Threat Coverage; Data Contracts. The trust-boundary view collapses into a Slide-2 toggle to avoid maintaining two copies of the system-map layout. Threat-model and data-contracts slides are summary-level with links to ARCHITECTURE.md rather than full-fidelity duplicates.
- **Deck is primarily a defense-day artifact, secondarily a future-you reference until the WU sequence lands.** Version-stamped to a named ARCHITECTURE.md commit AND a named FIX_PLAN.md commit at the top of the file. Until WU-9a / WU-9b / WU-10 / WU-23 / WU-25a land in ARCHITECTURE.md, the deck is also the easiest mid-implementation reference for those same structural concerns (F2 use case). After the WU sequence lands, ARCHITECTURE.md becomes a stronger source for mid-implementation lookups than the stamped deck, and F2 effectively retires — the deck remains useful for defense replay and structural overviews but is no longer the recommended reference surface for committed-decision recovery. After the Architecture Defense itself, post-defense textual drift is acceptable; the success criterion "stays in sync" is scoped to the stamped snapshot, not to the moving doc. This dual-purpose framing justifies the larger feature set (dock-below breakpoint, click-to-lock, slide-3 participant schema variant) — features that earn their keep across both jobs rather than only one.
- **Clean-academic visual style anchored to arXiv preprint typography.** Source Serif Pro (or similar transitional serif) headings, Inter (or similar humanist sans) body, JetBrains Mono identifiers. Motion is opacity-only, max 150ms. Frames the deck as defensible engineering rather than marketing.
- **Highlight + side panel hover behavior with panel-persistence-into-rail and click-to-lock.** Maximizes information density per slide. Panel push-shrinks the canvas to 720px minimum; below that, docks below the canvas. Click-to-lock pins the current panel for keyboard accessibility.
- **Two content sources with explicit roles (per R3).** ARCHITECTURE.md is the canonical source for textual content (component purpose, inputs/outputs, tools, failure modes); FIX_PLAN.md is the canonical source for diagram structure (Figure 1/2 split, node shapes, trust palette, sequence diagram) until the relevant WUs land in ARCHITECTURE.md. During the gap, the deck leads ARCHITECTURE.md on diagrams.
- **WU-25a classification (resolved 2026-05-12).** Safety Gate, Coverage Scoring, and Regression Promotion are all deterministic Platform Services (hexagon nodes on Slide 2), matching the current ARCHITECTURE.md. The four agents (Orchestrator, Red Team, Judge, Documentation) render as rectangles. ARCHITECTURE.md was already restructured during the round-1 architecture review to reflect this — the deck inherits it directly.
- **Version-stamp commits (resolved 2026-05-12).** The first deck version stamps both sources to `boundary-labs` commit `4f09569` (initial commit, contains ARCHITECTURE.md + FIX_PLAN.md post round-1 architecture review and round-2 brainstorm review). Diagram-source authority at stamp time: FIX_PLAN.md (the WU sequence has not yet landed in ARCHITECTURE.md). Subsequent deck rebuilds will re-stamp to whichever commits are current; subsequent re-stamping is a maintenance task, not a brainstorm decision.

---

## Dependencies / Assumptions

- The deck's textual content is sourced from `ARCHITECTURE.md` at a named commit. The deck's diagram structure is sourced from `FIX_PLAN.md` at a named commit until WU-9a / WU-9b / WU-10 / WU-23 / WU-25a land in ARCHITECTURE.md, after which authority shifts. Both commits are declared in a version-stamp comment block at the top of the deck file, with a one-line note indicating which source was diagram-authoritative at stamp time. Sync is scoped to both snapshots; post-defense drift is acceptable.
- The viewer has a modern desktop browser (Chrome / Firefox / Safari latest). The deck does not target browsers older than ES2020 / CSS Grid.
- The deck does not depend on network access at view time. All assets (fonts, images, SVG) are inlined or local-relative so the deck works offline.
- The deck loads from a `file://` origin (double-click-the-HTML opening). Implementation cannot rely on ES module imports, `fetch()` of sibling files, or `@font-face` referencing external paths — everything used at runtime must be inlined in the HTML file or sit in same-document `<script>` / `<style>` blocks. This constraint disqualifies any library option (Mermaid, cytoscape.js, React Flow) that requires CDN loading unless the library is bundled inline.
- Today's date for the deck content snapshot: 2026-05-12.

---

## Outstanding Questions

### Resolve Before Planning

- None. All three previously-blocking items resolved 2026-05-12 — see Key Decisions for the resolutions.

### Deferred to Planning

- [Affects R1, R2][Technical] Implementation choice: hand-authored SVG with vanilla JS hover handlers, Mermaid bundled inline with JS overlay for hover, or a library like cytoscape.js / React Flow bundled inline. The clean-academic style, `file://` origin, and offline-assets constraints bias toward hand-authored SVG + vanilla JS, but planning should evaluate the tradeoffs.
- [Affects R2][Technical] Whether the deck is a single `.html` file with everything inlined, or a small set of co-located files (`.html` + `.css` + `.js` + `.svg`) that still load by opening the HTML directly under the `file://` constraints.
- [Affects R5][Technical] The lifecycle overlay animation mechanism — CSS animations, JS-driven step-through, or pre-rendered animation frames. Coexistence rule is settled (R5); only the implementation mechanism is deferred.
- [Affects R3, R12][Technical] How the version-stamp comment block at the top of the deck file is generated and updated (manual write, git pre-commit hook, build step). The sync model (snapshot-only) is settled; only the stamping mechanism is deferred.
- [Affects R4, R5, R7–R10][Design] Exact layout coordinates for the system map, sequence diagram, attack surface map, threat coverage heat map, and data contracts cards. Belongs in planning / design.
- [Affects R16, R17][Design] Exact navy / teal hex values, exact muted trust-tier colors, exact font-weight stack inside the named families (Source Serif Pro / Inter / JetBrains Mono). Belongs in planning.
