# Contributing to Lore Proofkeeper

Thanks for your interest in Proofkeeper. This document covers the two things
every contribution needs: the Developer Certificate of Origin sign-off, and the
commit conventions the project history follows.

## Developer Certificate of Origin (DCO)

This project requires a DCO sign-off on every commit, per the Lore family's
licensing decision (Apache-2.0 + DCO). The DCO is a lightweight statement that
you have the right to submit the work under the project's license. Read the
full text at <https://developercertificate.org/>.

To sign off, add a `Signed-off-by` trailer to each commit:

```
Signed-off-by: Your Name <your.email@example.com>
```

Git does this for you with the `-s` flag:

```bash
git commit -s -m "feat(coverage): add unverified-capability report"
```

The name and email in the trailer must match the commit author. CI rejects
commits without a valid sign-off.

## Commit messages

Use the conventional form `type(area): imperative summary [ref]`, for example:

```
feat(coverage): report capabilities with no verified_by edge [roadmap:v0.0.1]
```

Allowed types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`.

Do **not** add tool attribution to commits, pull requests, or comments — no
`Co-Authored-By` naming a tool, no "Generated with …" line, no session-link
footer. The commit belongs to the project history, not the tool used to write
it.

## The boundary (please read before adding features)

Proofkeeper is a **contract consumer** of Lore. It reads the published
`rac export --graph` JSON contract (and, later, the `lore` MCP); it never
imports the Lore engine's internals or its private API. Write-back to a Lore
corpus happens **only** as a proposed, human-reviewed pull request — Proofkeeper
never mutates a corpus directly. No model is bundled: Proofkeeper is
bring-your-own-model. Keep contributions on the right side of that line.

## Local checks

```bash
npm install
npm run typecheck
npm test
npm run build
```
