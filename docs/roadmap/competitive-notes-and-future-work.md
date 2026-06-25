# Competitive notes & future work

Captured while building the `## Verified By` write-back. Comparison against
Devin's *testing & recordings* and Factory's docs, plus future roadmap items
those surfaced. These are notes for the eventual `itsthelore/lore-proofkeeper`
roadmap series, not committed scope.

## Comparison

| | Devin | Factory | Proofkeeper |
|---|---|---|---|
| Browser-driven QA | Records a session | Droid Control ("automate terminals, browsers, desktop apps for QA and validation") | Autonomous drive (BYO-model) |
| Output of a verification | **Watch-once annotated video** (auto-zoom, text annotations, idle compression) — "proof artifact rather than replay mechanism" | — | **Durable re-runnable Playwright test + interactive trace** |
| Trust model | Reviewer **watches the video** | Automated PR/MR review surfaces results | Reviewer **reads the committed test + re-runs it** |
| Flakiness / fidelity | "No formal trace, fidelity, or flakiness handling" | — | The **fidelity gate** (N green re-runs) is the moat |
| Knowledge write-back | Proposes a **Skill** (markdown) **via PR** | AGENTS.md conventions | Proposes **`## Verified By`** (markdown) **via PR** |
| Maturity signal | — | **Agent Readiness** ("measure repository maturity, track autonomy progress over time") | Coverage read-model ("what is unverified?") |

**Takeaway.** Devin and Factory validate Proofkeeper's shape (drive → compile →
propose-via-PR; Skills-via-PR ≈ Verified-By-via-PR). The differentiation is the
**re-runnable test + interactive trace + fidelity gate** — precisely the
capabilities Devin's docs say it does not have. We should keep leaning on
"verify by *reading and re-running* the committed test", not "watch a recording".

## Future roadmap items (not built)

1. **Verification-readiness score (from Factory "Agent Readiness").** Turn the
   coverage read-model into a tracked metric: % of capabilities verified, trend
   over time, surfaced per-PR and per-repo. Aligns with roadmap Initiative 7
   (org-scale verification governance / multi-repo coverage aggregation).
2. **Drive test-plan step (from Devin's explicit plan phase).** An optional
   planning turn where the BYO model picks "the single most important end-to-end
   flow that proves the capability" before driving — sharpening the moat's focus
   and reducing wasted exploration.
3. **Richer PR evidence (deferred from this change).** A readable step summary of
   the driven flow (rendered from the recorded `Action[]` IR) and a trace-replay
   affordance (`npx playwright show-trace …` / Playwright HTML report) in the
   write-back PR — Devin's "watch it" parity, but backed by a replayable trace.
   Prototyped and reverted to keep the bare-path change focused; revisit as its
   own initiative.
