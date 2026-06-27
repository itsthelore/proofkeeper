# Proofkeeper as the open-source autonomous-QA DROID

This records the build shape that makes Proofkeeper the **open-source equivalent
of Factory's DROID** — an autonomous agent that, given real developer tools,
drives a product to verify it and leaves durable, replayable evidence in a pull
request. It complements `competitive-notes-and-future-work.md` (the Devin /
Factory comparison) by naming what we build, what we deliberately do not, and in
what order.

## The boundary (settled, load-bearing)

DROID spans three capability families. The recorded Lore decisions split them
across *different* siblings — they do not all belong to Proofkeeper:

| DROID capability | Lore home | In Proofkeeper? |
|---|---|---|
| Automated QA (drive → compile → verify → evidence-in-PR) | **Proofkeeper** | ✅ ADR-083 |
| Browser **and terminal** control | **Proofkeeper** | ✅ ADR-083 ("a browser and a terminal") |
| PR **code review** (semantic judgment of code) | **Watchkeeper / Gatekeeper** | ❌ ADR-083 Non-Goals |

**Non-goal — code review and codegen.** ADR-083's roadmap Non-Goals are
explicit: Proofkeeper must not become "a coding agent, a codegen tool, or a
general-purpose agent runtime… produces verification evidence and nothing else."
Factory's DROID code review is therefore **out of scope** here. It is a
Watchkeeper (CI change review, ADR-043) / Gatekeeper (PR enforcement, ADR-049)
concern; folding it into Proofkeeper would contradict a settled decision and
would need its own ADR for a distinct sibling product. We do not build it.

Everything below stays on the contract-consumer side of the boundary
(ADR-063/083): no engine change is required — the `verified_by` edge already
exists in the engine. Proofkeeper produces and runs the evidence; Lore records
it.

## Initiatives (this build)

Delivered as a v0.1.0 → v0.4.0 series on top of the v0.0.1 prototype (coverage
read-model, runner, fidelity gate, compiler, browser drive, write-back).

### v0.1.0 — `qa` / `verify`: the DROID loop behind one command — Landed

One command runs the whole loop: select an unverified capability → drive →
compile → fidelity → run → optionally propose the `## Verified By` write-back.
Mirrors Factory's `/qa` `/verify` `/qa-test`. The library entry point is
`runQa`; the drive is an injected seam (browser-backed at the CLI, a double in
tests).

### v0.2.0 — Terminal tool surface: browser **and** terminal — Landed

`run_command`, `expect_output`, `expect_exit` extend the agent's tools and the
recorded-action IR, so a session may interleave browser and terminal work and a
**CLI capability** compiles to a Playwright test that runs the command and
asserts its output. Models Factory droid-control's terminal driving. The shell
runs in the product's own dev environment; the committed test is the human
review surface (ADR-065).

### v0.3.0 — PR-triggered, diff-scoped QA — Landed

A `proofkeeper.config.json` path map (Factory automated-qa's `path_patterns`)
scopes a change to the capabilities it touches; `qa --config --changed/--base-ref`
drives the unverified ones and posts the evidence as a pull-request comment.
Gates red if any touched-and-unverified capability did not become stable.

### v0.4.0 — Failure-learning + richer PR evidence — Landed

A pluggable `LearningStore` remembers failed attempts and feeds the reasons into
the next drive (Factory automated-qa's failure-learning). The write-back PR
carries a readable **step summary** of the driven flow and a **trace-replay
hint** (`npx playwright show-trace`), so a reviewer reads what was exercised then
re-runs the committed test (Devin/Factory evidence parity, backed by a
re-runnable test rather than a watch-once video).

## Deliberately out / deferred

- **Code review / codegen** — ADR-083 non-goal; a distinct sibling (new ADR) if
  ever pursued, never inside Proofkeeper.
- **Cross-OS / VM-fabric runner, Proofkeeper Cloud, multi-repo coverage
  aggregation, verification-readiness score** — commercial / Initiative 7 of the
  engine roadmap; recorded as future intent, not built here.
- **Other-provider `ModelClient` adapters; an `lore` MCP client** — the read
  model uses `rac export --graph` today; the Claude adapter is the one reference
  BYO-model example.
- **Per-command environment overrides for the terminal tool** — the terminal
  records command + cwd today.

## Why this is "the open-source DROID"

Proofkeeper now drives a product with a **browser and a terminal**, **bringing
your own model**, behind **one command**, scoped to a **pull request**, learning
from **failures**, and leaving **durable, re-runnable evidence** a human reviews
— the autonomous-QA half of DROID, in the open, bounded to verification. The
differentiator over Devin/Factory remains the **re-runnable test + interactive
trace + fidelity gate**: an agent's work is verified by *reading and re-running*
the committed test, not by watching a recording.
