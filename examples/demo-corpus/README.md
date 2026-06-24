# Demo Lore corpus

A small, self-contained fixture standing in for a target [Lore](https://github.com/itsthelore)
corpus — the `rac/` directory Proofkeeper proposes `## Verified By` write-backs
into. It exists to demonstrate the write-back end-to-end against a real GitHub
pull request without touching another repository.

`rac/requirements/demo-checkout.md` is a requirement with **no** `## Verified By`
section. Proofkeeper's write-back proposes one — linking the committed
`examples/seed.spec.ts` and its replayable trace — as a human-reviewed PR.

> This is a fixture, not a live corpus. The merge is separately proven to
> validate against the real engine (`rac validate` + `rac relationships
> --validate`) on an actual rac-core requirement; see the README write-back
> section.
