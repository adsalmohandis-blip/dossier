# Dossier

**Evidence bundles for AI-assisted firmware.**

Your coding agent writes firmware. From 9 December 2026 that firmware is a *product* under the EU Product Liability Directive, and from 11 December 2027 the Cyber Resilience Act requires a technical file for it. Dossier records what the agent wrote, which gates it passed and who approved it — and produces a file you can hand to an assessor.

```bash
npx dossier-cli init
npx dossier-cli task start T-1 --title="add sensor read" --model=claude-opus-5
npx dossier-cli task end T-1 --files=src/sensor.c
npx dossier-cli approve --actor="eng.lead" --release=v1.0.0
npx dossier-cli bundle --release=v1.0.0
```

Output: a signed-ready JSON record and a readable Markdown file, with a SHA-256 hash anyone can re-verify.

## What it does

| | |
| --- | --- |
| **Records** | every change, the model that produced it, the task it belonged to |
| **Gates** | static analysis, coverage, binary size, human approval — and refuses to produce a bundle while one is failing |
| **Decides** | architecture decision records with context, decision, consequences and supersedes |
| **Proves** | an append-only, hash-chained event log; tampering with any event is detected |

## What comes out

Three artifacts, and none of them is a certificate.

| Artifact | Where it lives | What it says |
| --- | --- | --- |
| **Evidence Bundle** (`bundles/<release>.json`) | with you | every change, gate, decision and approval, sealed with one hash |
| **Release Record** (`bundles/<release>.md`) | with you | the same content, written to be read by a person |
| **Verification Receipt** (`receipts/<prefix>.html`) | safe to publish | a hash, a date and a status, with a QR code and nothing else |

```sh
dossier bundle --release=v1.0.0
dossier receipt .dossier/bundles/v1.0.0.json --org="Your company"
```

The receipt is one self-contained page: no scripts, no fonts fetched, no network calls, so it still
works when it is opened from a folder years later. The QR code is generated locally by `src/qr.js`,
which has no dependencies. Dossier does not certify, assess or approve anything, and the receipt
says so on its face.


## What it does not do

- It does not generate code. Your agent does that.
- It does not analyse code. `cppcheck`, Parasoft and friends do that; Dossier reads their reports.
- It does not build SBOMs. Zephyr emits SPDX; Dossier links it.
- It does not grant certification. A notified body does that; Dossier prepares what they ask for.
- It does not touch the network. No telemetry, no accounts, no upload. Your code never leaves your machine.

## Install

```bash
npx dossier-cli --help      # no install
npm install -g dossier-cli  # or install it
```

Node 18 or newer. Zero runtime dependencies.

## Toolchains

Detected automatically: Zephyr (`west.yml`, `prj.conf`), PlatformIO (`platformio.ini`), ESP-IDF (`sdkconfig`), generic CMake.

## Gates

Configured once in `dossier.config.json`:

```json
{
  "gates": {
    "static_analysis": { "tool": "cppcheck", "report": "reports/cppcheck.xml", "max_errors": 0, "enabled": true },
    "coverage":        { "tool": "lcov", "report": "reports/lcov.info", "min_percent": 70, "enabled": true },
    "binary_size":     { "artifact": "build/zephyr/zephyr.bin", "max_bytes": 262144, "enabled": true },
    "human_approval":  { "required": true, "enabled": true }
  }
}
```

A gate with a missing report is reported as **skipped**, never as passed. Silence is never evidence.

## Verifying a bundle

```bash
dossier verify .dossier/bundles/v1.0.0.json
```

Recomputes the hash over the bundle's own content. Change one character anywhere and it fails. The assessor can run this without installing anything else and without contacting us.

## Commands

| Command | Purpose |
| --- | --- |
| `init` | detect the toolchain and create `.dossier/` |
| `status` | event counts and chain integrity |
| `task start` / `task end` | record a unit of agent work |
| `adr add` / `adr list` | architecture decision records |
| `approve` | record a named human approval |
| `gate run` | run the gates and record the result |
| `bundle` | build the evidence bundle for a release |
| `verify` | re-verify any bundle file |
| `doctor` | environment and workspace checks |

## Status

`v0.1.0` — early. The bundle schema is `dossier.evidence/v0` and will change before `v1.0.0`.

Signing, the public verification page and the transparency log are not in this release.


## What we can see

Nothing. Dossier has no telemetry and no account, and nothing is uploaded unless you run a
command whose whole job is to upload. The source is here so you do not have to take that
on trust.

That leaves no way to learn what is worth building, so there is one command for it:

```sh
dossier report
```

It writes a single file of counts — which gates you turned on, how many passed, which
toolchain was detected, how many decisions were recorded — prints every line to your
terminal before writing it, and **sends nothing anywhere**. No file names, no hashes, no
company or product names, no coverage figures, no names of people who approved. Read it,
and mail it to `info@admitnexus.com` only if you are happy with what it says. The tool
behaves identically whether you do or not.

The report is assembled from a fixed list of derived numbers rather than by filtering your
event log, so a field added to Dossier in a later version cannot reach a report by
accident. `tests/report.test.js` asserts exactly that.

## The rule about uploading

Dossier uploads nothing unless you ask for it by name, and `tests/promise.test.js` fails
the build if any module under `src/` so much as requires a network module without being
named in that test's allowlist first. If a future version ever needs to
register a receipt hash so a link resolves, [RECEIPTS.md](RECEIPTS.md) sets out the only
terms on which that may happen: a command of its own, the exact content shown before it is
sent, a typed yes with no as the default, hashes and dates only, and a tool that still
works fully if you decline.

## Price

The tool is free and MIT licensed, which means that cannot be withdrawn later. What is
charged for sits on top of it: preparing a release with you, and later, signing and hosting
receipts. See [the price page](https://adsalmohandis-blip.github.io/dossier/pricing/).


## Licence

MIT.
