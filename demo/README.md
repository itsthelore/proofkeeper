# Demo assets

The GIFs in the README are generated from these scripts. Two things, both **honest
about what's live**:

- **The drive → compile loop is real** — real Chromium, the real `AutonomousDriver`,
  the real deterministic emitter, against the real demo product page
  (`examples/product/index.html`).
- **The model is swappable.** By default a *scripted* `ModelClient` decides the
  actions, so the demo is deterministic and costs no tokens. Set an API key and the
  same script runs a *real* LLM drive (see [Record a real run](#record-a-real-run)).

Committed output:

| GIF | What it shows |
|---|---|
| `docs/assets/proofkeeper-drive.gif` | a drive: the agent loads the page, clicks **Verify**, and the status flips `unverified → verified` |
| `docs/assets/proofkeeper-coverage.gif` | `proofkeeper coverage` reporting an unverified capability |

## Prerequisites

```bash
npm install && npm run build
npx playwright install chromium
# ffmpeg for webm→gif; asciinema + agg for the terminal cast
```

## Regenerate the drive GIF

```bash
node --import tsx demo/drive-demo.ts          # writes demo/out/drive.webm

# webm → gif (palette for clean colour)
cd demo/out
ffmpeg -y -i drive.webm -vf "fps=12,scale=720:-1:flags=lanczos,palettegen=stats_mode=diff" pal.png
ffmpeg -y -i drive.webm -i pal.png \
  -lavfi "fps=12,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer" \
  ../../docs/assets/proofkeeper-drive.gif
```

## Regenerate the coverage GIF

```bash
# rac must be on PATH (the coverage --corpus path shells out to `rac export --graph`)
asciinema rec --cols 92 --rows 12 --overwrite -c \
  "printf '$ proofkeeper coverage --corpus path/to/rac/\n'; node dist/cli.js coverage --corpus examples/demo-corpus/rac" \
  demo/out/coverage.cast
agg --cols 92 --rows 12 --font-size 22 --theme asciinema \
  demo/out/coverage.cast docs/assets/proofkeeper-coverage.gif
```

## Record a real run

The same harness runs a real LLM drive when a key is present — point it at the demo
page or your own app:

```bash
# real drive against the bundled demo page, recorded to demo/out/drive.webm
OPENAI_API_KEY=sk-… node --import tsx demo/drive-demo.ts
# or Claude: ANTHROPIC_API_KEY=… node --import tsx demo/drive-demo.ts

# your own app + goal (skip the bundled server):
OPENAI_API_KEY=sk-… \
PROOFKEEPER_DEMO_URL=http://localhost:3000/ \
PROOFKEEPER_DEMO_GOAL="Add an item to the cart and confirm the total updates." \
  node --import tsx demo/drive-demo.ts
```

Then convert `demo/out/drive.webm` to a GIF as above.

For a terminal recording of the **real CLI** end to end, record the `qa` command
directly (it drives, compiles, fidelity-gates, and runs):

```bash
asciinema rec --overwrite -c \
  "OPENAI_API_KEY=sk-… proofkeeper qa --corpus path/to/rac/ --url http://localhost:3000/" \
  run.cast
agg run.cast run.gif
```

`demo/out/` is git-ignored; only the two GIFs under `docs/assets/` are committed.
