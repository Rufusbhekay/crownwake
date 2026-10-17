---
title: Crownwake Flight Recorder - Plan
type: feat
date: 2026-09-13
topic: crownwake-flight-recorder
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Crownwake Flight Recorder - Plan

## Goal Capsule

- **Objective:** Let the Crownwake game tester capture a bug from the ordinary game menu and receive a grounded diagnosis from its saved evidence.
- **Means:** Keep a rolling canvas clip and normalized gameplay timeline in the local browser, then hand the marked evidence to a loopback-only project inbox. (KTD1, KTD2, KTD3)
- **Product authority:** This work covers in-game bug reporting, automatic bug alerts, and local handoff to this coding workspace. It does not change combat, navigation, or editor rules.
- **Execution profile:** Implement and validate the recorder, HUD, and local-host handoff without adding external dependencies or services.
- **Open blockers:** None.

---

## Product Contract

### Summary

Crownwake will extend its existing AI Monitor into a local Flight Recorder that is controlled from the ordinary in-game menu.
When a tester selects MARK BUG, it saves the preceding evidence window to a local project inbox so the tester can return to this chat and ask what was captured.

### Problem Frame

AI and navigation faults happen during a moving battle, but the current monitor only describes a selected unit's present state.
By the time a screenshot or manual report is shared, the target changes, path failures, collisions, and floor-support transitions that caused the symptom may be gone.
The tester also should not need to find a developer-only menu or manually locate a downloaded file before asking for help.

### Key Decisions

- **Local flight recorder rather than real-time sharing.** It keeps testing private and avoids an external capture service. Governs R1, R7, R8, R10. (session-settled: user-directed — chosen over real-time sharing: local, private capture is the preferred first step.)
- **Video and diagnostics travel together.** The reviewer needs both the visible symptom and the game state behind it. Governs R2, R3, R7, R10. (session-settled: user-directed — chosen over telemetry-only export: the report must show the issue as well as explain it.)
- **Automatic markers complement manual reports.** The runtime flags likely faults without replacing the tester's judgment. Governs R4, R5, R6, R9, R11. (session-settled: user-directed — chosen over manual marking alone: suspected failures should be captured automatically while any felt problem remains reportable.)
- **Bug reporting lives in the ordinary game menu.** The tester should never have to open the developer menu to capture a report. Governs R1, R5, R6, R11.

### Actors

- A1. **Game tester** runs a local playtest, sees automatic alerts or notices an issue, marks it from the game menu, and asks for help in this chat.
- A2. **Crownwake runtime** records relevant local context and marks suspicious combat or navigation states without disrupting play.
- A3. **Investigator** reviews the saved local video and diagnostic record to reproduce and explain the reported behavior.

### Requirements

**Capture**

- R1. Every local Crownwake playtest starts a bounded local recorder automatically and exposes MARK BUG in the ordinary in-game menu rather than a developer-only menu.
- R2. A marked report includes the preceding 15 seconds of rendered game-canvas video.
- R3. The same report includes a timestamped gameplay timeline with the level context, actor positions and life state, combat targets, navigation state, collisions, and key spawn, damage, death, and building events.
- R4. The runtime creates timestamped anomaly markers for unsupported or off-floor actors, repeated navigation stalls or collision deadlocks, and paired CH/EN that make no progress toward attack range.

**Reporting and handoff**

- R5. An automatic anomaly shows a visible in-game POSSIBLE BUG alert that names the category and affected unit or units without stopping play.
- R6. A tester can use MARK BUG at any time from the game menu and add an optional description of what felt wrong.
- R7. On the local Crownwake host, a completed report is saved to a local project debug inbox that the investigator can inspect when the tester asks about the latest capture in chat.
- R8. The recorder captures only the game canvas and local gameplay diagnostics; it never records the microphone, desktop, or external browser data.
- R9. Recording, marker creation, alerts, and reporting never pause the simulation, change AI decisions, or end the playtest.
- R10. If the browser cannot produce video or the local inbox is unavailable, the report still provides the diagnostic timeline through a clear download fallback.
- R11. The game menu exposes capture state, recent anomaly markers, and the manual MARK BUG action while the local recorder is active.

### Key Flows

~~~mermaid
flowchart LR
  A[Local game playtest] --> B[Rolling local capture]
  B --> C[Automatic anomaly marker]
  C --> D[In-game possible bug alert]
  A --> E[MARK BUG in game menu]
  D --> E
  E --> F[Local debug inbox]
  F --> G[Ask assistant in chat]
  G --> H[Investigation]
~~~

- F1. **Automatic observation**
  - **Trigger:** A1 begins a local playtest.
  - **Actors:** A1, A2.
  - **Steps:** A2 starts the bounded capture, samples the diagnostic timeline, and adds any anomaly marker without interrupting play.
  - **Outcome:** A recent evidence window is ready before an issue is noticed.
  - **Covers:** R1, R3, R4, R8, R10.
- F2. **Automatic bug alert**
  - **Trigger:** A2 detects a supported-state, pathing, collision, or stalled-duel anomaly.
  - **Actors:** A2, A1.
  - **Steps:** A2 records a timestamped marker, shows A1 a POSSIBLE BUG alert, and continues the playtest normally.
  - **Outcome:** A1 can immediately see what the game noticed and decide whether to preserve the evidence.
  - **Covers:** R4, R5, R9, R11.
- F3. **Manual bug report**
  - **Trigger:** A1 sees a bug, suspects a problem, or acts on an automatic alert.
  - **Actors:** A1, A2, A3.
  - **Steps:** A1 selects MARK BUG from the game menu, optionally records a note, and A2 saves the evidence package to the local debug inbox.
  - **Outcome:** A3 can inspect the visible event and its diagnostic history after A1 asks about it in chat.
  - **Covers:** R2, R3, R6, R7, R8, R11.
- F4. **Chat investigation**
  - **Trigger:** A1 asks what the latest marked bug captured.
  - **Actors:** A1, A3.
  - **Steps:** A3 reads the latest report in the local debug inbox and compares its markers, event sequence, and video evidence.
  - **Outcome:** A1 receives a grounded explanation of the captured issue.
  - **Covers:** R3, R4, R7.
- F5. **Video or inbox fallback**
  - **Trigger:** The browser cannot retain a canvas video clip or the local host cannot save the report.
  - **Actors:** A1, A2, A3.
  - **Steps:** A2 keeps the structured diagnostic timeline and offers a download fallback when it cannot complete the local handoff.
  - **Outcome:** A3 still receives useful reproduction evidence.
  - **Covers:** R7, R10.

### Acceptance Examples

- AE1. **Manual report retains the lead-up**
  - **Covers R2, R3, R6, R7.**
  - **Given:** A local playtest has been running for more than 15 seconds.
  - **When:** The designer marks a bug after a unit behaves unexpectedly.
  - **Then:** The local debug inbox receives the preceding canvas clip, the timeline around that moment, and any optional note.
- AE2. **Stalled duel raises an in-game alert without interrupting play**
  - **Covers R4, R5, R9, R11.**
  - **Given:** A paired CH and EN remain outside attack range with no progress.
  - **When:** The anomaly condition is reached.
  - **Then:** The game shows a POSSIBLE BUG alert for the pair, records a marker, and gameplay continues unchanged.
- AE3. **Chat investigation uses the latest local capture**
  - **Covers R3, R4, R7.**
  - **Given:** The tester has marked a bug on the local Crownwake host.
  - **When:** The tester asks in chat what the bug captured.
  - **Then:** The investigator can locate the latest local report and explain its captured event sequence and anomaly markers.
- AE4. **Diagnostic fallback remains useful**
  - **Covers R7, R10.**
  - **Given:** The current browser cannot capture a canvas video or save to the local inbox.
  - **When:** The designer marks a bug.
  - **Then:** The report offers a downloadable diagnostic record and makes the unavailable part explicit.

### Success Criteria

- A tester can capture a suspected issue with one action from the ordinary game menu rather than navigating to developer tools.
- A tester can return to this chat and have the latest marked local report located for investigation.
- An investigator can see the reported moment and identify the affected actors, targets, pathing state, and relevant automatic markers.
- Recorder activity remains local and does not change match behavior.

### Scope Boundaries

**Deferred for later**

- Deterministic in-game replay of an exported report.
- Real-time co-viewing, remote upload, and a shared issue history.
- Broader automatic bug diagnosis beyond the agreed combat and navigation anomalies.

**Outside this feature**

- A public hosted support pipeline or player-account bug reporting.
- Microphone, desktop, or browser-tab capture.
- Changes to CH/EN combat behavior, collision rules, pathfinding, level design, or editor persistence.

### Dependencies / Assumptions

- The local Crownwake host accepts a report into a project-local debug inbox while it runs on the tester's machine.
- This coding workspace can read the local debug inbox when the tester asks about the latest marked report.
- Browsers that support canvas video capture provide the preferred evidence form; unsupported browsers use the R9 fallback.
- The ordinary in-game menu remains available during local playtests.

### Outstanding Questions

**Deferred to Planning**

- Choose the diagnostic sampling cadence, anomaly thresholds, local inbox retention, export packaging, and supported-browser fallback details while preserving R1-R11.

### Sources / Research

- game.js:63 enables the existing developer-only monitor.
- game.js:557 and game.js:587 build the live target, line-of-sight, navigation, collision, and combat snapshot currently shown to the developer.
- src/sim.js:1459 defines the actor diagnostic snapshot fields available to the monitor.
- package.json:1 confirms Crownwake is a local browser project without a current recording or upload dependency.
- tools/serve.mjs:44 shows that the current local host serves files only and needs the local report handoff path.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Use a rolling `canvas.captureStream()` + `MediaRecorder` buffer for the visual window.** Start it with the local playtest, retain timestamped chunks only inside the 15-second window, and freeze the current window when the tester marks a bug. This is supported by the [W3C Media Capture from DOM Elements specification](https://www.w3.org/TR/mediacapture-fromelement/) and [MediaStream Recording specification](https://www.w3.org/TR/mediastream-recording/). (session-settled: user-directed — chosen over telemetry-only export: the report must include the visible gameplay.)
- KTD2. **Keep recorder analysis pure and bounded outside battle control.** A new browser-neutral module will prune records, normalize report data, debounce anomaly markers, and detect sustained stalled duels from supplied primitive snapshots. `game.js` only observes simulation state and renders recorder UI, so recorder logic cannot alter AI or collision behavior. (session-settled: user-directed — chosen over manual marking alone: suspected faults must be marked automatically.)
- KTD3. **Add two fixed loopback report endpoints to the existing static host.** The server creates a safe report identifier, writes metadata and an optional WebM file below `artifacts/flight-recorder`, rejects unbounded or unsafe bodies, and never accepts client-selected paths. (session-settled: user-directed — chosen over real-time sharing: evidence remains local to the project workspace.)
- KTD4. **Use a dedicated HUD alert and non-blocking report panel.** The alert is independent of the shared toast, which combat and deployment already reuse; the panel accepts an optional note after the evidence is frozen and does not pause the game. (session-settled: user-directed — chosen over developer-only controls: capture belongs in the normal game HUD.)

### High-Level Technical Design

~~~mermaid
flowchart TB
  G[game.js playtest loop] --> R[Flight recorder core]
  G --> H[HUD: MARK BUG and POSSIBLE BUG]
  R --> M[Bounded samples, events, markers]
  G --> V[Canvas MediaRecorder chunks]
  H --> P[Marked report package]
  M --> P
  V --> P
  P --> S[Loopback serve.mjs endpoint]
  S --> I[artifacts/flight-recorder inbox]
  P --> D[Download fallback]
~~~

Recorder lifecycle: `start()` initializes recording after entering a playtest; the loop records only while `mode === "playing"`; a MARK BUG click freezes a copy of the current 15-second report and asynchronously saves it; restart, exit, and end states stop and discard the active recorder.

### Implementation Constraints

- The top-bar control must remain available on mobile and must not be placed inside Settings because opening Settings resets the playtest (`game.js:4671`).
- The recorder serializes only primitive diagnostics, never Three.js objects, DOM nodes, or external browser data.
- A failed `MediaRecorder`, canvas capture, or inbox request degrades to JSON and WebM downloads without throwing into the gameplay loop.
- The server accepts only its two explicit recorder routes before static-file resolution and preserves all existing static-host behavior.
- The report inbox is project-local and ignored by Git through the existing `artifacts/` rule.

### Implementation Sequence

1. Add and test bounded recorder primitives before wiring them to real gameplay.
2. Add the HUD controls, loop observers, capture lifecycle, alerts, and fallback behavior.
3. Extend the local server with constrained inbox routes and test them against a temporary directory.
4. Run source, build, browser-smoke, and diff checks after integrating all units.

---

## Implementation Units

### U1. Bounded recorder core

- **Goal:** Provide deterministic, pure helpers for retaining the recent evidence window and producing deduplicated anomaly markers.
- **Requirements:** R2, R3, R4, R9, R10.
- **Files:** `src/flight-recorder.js`, `tests/flight-recorder.test.js`, `tools/verify.mjs`.
- **Approach:** Define window and sampling constants; append/prune timestamped records; normalize a report copy; deduplicate marker keys on a cooldown; and track a paired-duel distance over time so only a sustained lack of closing progress becomes a stalled-duel marker. Keep functions parameterized with primitive values so tests do not need Three.js or the browser.
- **Test scenarios:** A record older than 15 seconds is removed while newer events remain; repeated identical anomalies inside cooldown yield one marker; a duel that closes distance resets its stall watch; a pair that remains out of range without progress produces one marker; a report snapshot cannot mutate the retained live records.
- **Verification:** `npm test` runs the focused recorder tests and `npm run verify` includes the new source module.

### U2. In-game capture, alerts, and manual reporting

- **Goal:** Let a local tester mark the current evidence window from the ordinary HUD while the runtime raises visible anomaly alerts without changing play.
- **Requirements:** R1, R2, R3, R4, R5, R6, R8, R9, R10, R11.
- **Files:** `index.html`, `styles.css`, `game.js`.
- **Approach:** Add a visible top-bar `MARK BUG` control, recorder status, a separate `POSSIBLE BUG` region, and a lightweight non-blocking note panel. Initialize canvas capture in `start()`, retain 15 seconds of timestamped media chunks, sample normalized actor and match state from the existing loop, add key lifecycle events at the existing spawn/damage/death/void/duel hooks, and asynchronously submit a frozen package. Use the U1 observer to create alert markers. When browser capture or submit fails, download the retained diagnostic JSON and any video clip instead. Cite KTD1, KTD2, KTD4.
- **Test scenarios:** Starting a local playtest shows recorder-ready state; a manual mark creates a bounded report without pausing simulation; an off-floor/path-stall/stalled-duel marker updates the dedicated alert while ordinary toast messages still work; unavailable video or inbox preserves a downloadable diagnostic report; mobile styling retains the report action.
- **Verification:** Source-contract tests cover the required controls and lifecycle wiring; `node --check game.js` succeeds; local smoke serves the changed HUD.

### U3. Local report inbox

- **Goal:** Persist a marked local report where this workspace can inspect it without exposing arbitrary file writes.
- **Requirements:** R3, R7, R8, R10.
- **Files:** `tools/serve.mjs`, `tests/serve.test.js`.
- **Approach:** Refactor the host to export a server factory for tests while preserving direct CLI startup. Handle a metadata POST by allocating a server-generated safe identifier and saving a bounded JSON file. Handle an optional media POST only for that identifier and write a bounded WebM file under a configured inbox. Reject unexpected methods, paths, malformed JSON, over-limit bodies, and invalid identifiers. Return JSON success so the browser can attach the optional video or note; leave static GET handling unchanged. Cite KTD3.
- **Test scenarios:** A valid metadata-plus-video sequence writes paired files in a temporary inbox; unsafe route and client filename attempts cannot write outside it; malformed/oversized metadata returns a client error; a static asset remains fetchable; an unavailable endpoint is handled by U2's download fallback.
- **Verification:** `npm test` runs server integration tests; `npm run smoke:local` still receives the app index from the local server.

### U4. End-to-end validation and handoff readiness

- **Goal:** Verify the new local evidence path without broadening the gameplay change.
- **Requirements:** R1-R11.
- **Files:** `tests/flight-recorder.test.js`, `tests/serve.test.js`, `tools/verify.mjs`, generated `sim-runtime-20260724g.js` only if build changes it.
- **Approach:** Add focused unit and integration coverage, preserve runtime-copy parity, run project validation, and manually exercise one local report request if the server is available. Do not alter unrelated dirty work.
- **Test scenarios:** The complete test suite passes with no source-contract drift; build output remains valid; static serving and recorder route behavior both work; the diff has no whitespace errors.
- **Verification:** Run the Verification Contract commands in order.

---

## Verification Contract

| Command | Proves |
| --- | --- |
| `npm test` | Recorder-window, anomaly, server route, and existing simulation behavior pass. |
| `npm run build` | Generated simulation runtime remains synchronized. |
| `npm run verify` | Required source files and runtime parity remain valid. |
| `npm run smoke:local` | The local host still serves the application. |
| `node --check game.js` | Main browser module parses. |
| `node --check tools/serve.mjs` | Local host and inbox module parse. |
| `git diff --check` | The focused change introduces no whitespace errors. |

---

## Definition of Done

- U1 is done when its bounded data and anomaly behavior pass direct unit tests without browser state.
- U2 is done when the normal HUD provides MARK BUG, automatic alerts are independent of toast messages, and report capture cannot pause or modify the battle.
- U3 is done when the loopback host stores only bounded, safe report files inside the debug inbox and continues serving static assets.
- U4 is done when every command in the Verification Contract passes, fallback paths remain explicit, and no abandoned recorder implementation is left in the diff.
- The feature is complete when a tester can mark a local gameplay issue, return to chat, and the workspace contains the recent evidence required to investigate it.
