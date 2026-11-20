# Receipts, links, and the rule about uploading

Dossier tells every engineer who runs it that nothing is uploaded unless they
ask for it by name. That sentence is the product. It is written to stay true
after an upload exists, so it never has to be quietly withdrawn — a privacy
claim that gets walked back costs more trust than one that was never made.

This file is the set of terms that keep it true.

## The rule

**Dossier may never send anything anywhere as a side effect of doing something
else.** Not when a bundle is built, not when a receipt is generated, not when a
gate runs, not on first use, not to check for updates, not to count installs.

A version of Dossier that uploads anything may do so only when all five of
these hold:

1. **A command of its own.** The upload is the whole point of the command the
   person typed. It is never folded into `bundle`, `receipt`, `gate` or `init`.
2. **Shown before sent.** The exact content is printed to the terminal, in
   full, before anything is transmitted. No summary, no "and some diagnostics".
3. **A yes that was typed.** The default answer is no. `--yes` may exist for
   scripts, but the bare command always asks.
4. **Hashes and dates only.** A receipt registration may carry the bundle hash
   and the date it was registered. It may never carry a product name, a company
   name, a release number, a file path, an engineer's name, a gate measurement,
   a model name, an IP-derived location, or anything an agent wrote.
5. **Refusable without loss.** Saying no leaves a fully working tool. Evidence
   bundles, release records and local receipts all keep working, and a receipt
   that was never registered is still verifiable by recomputing the hash.

What the prompt has to look like:

```
$ dossier register .dossier/bundles/v1.0.0.json

This sends one line to the Dossier transparency log:

  hash  ba6f57a167032b14a2e13e1c6a3efd88399ec6950c701d6dcd73657840ca846dd
  date  2026-11-20

Nothing else. Not your product, not your company, not your release,
not who approved it. Saying no changes nothing about how Dossier works.

Send it? [y/N]
```

## Why there is no link by default

`dossier receipt` draws a QR code only when you pass `--url-base`, because a QR
code is a promise that something is there. On a printed technical file a QR that
resolves to nothing does not read as a broken link — it reads as a forgery, in a
document whose entire job is to show that nothing was forged.

So the tool will not invent a destination, and it refuses to point at a host we
do not serve. If you have nowhere to put the page yet, the receipt still works:
anyone holding the bundle can recompute its hash and compare it with the one
printed on the receipt.

## If hosting is ever offered

Three things have to be true before a hosted link is sold to anyone:

- **No promise of permanence we cannot keep.** "Hosted while you subscribe, and
  the bundle is yours forever, and verification never needs us" is honest.
  "Permanent link" is not, unless someone has funded ten years of it.
- **A mirror outside our control.** The log of registered hashes is mirrored
  somewhere that survives us, so a receipt issued today still checks out if the
  company stops existing.
- **An exit plan published up front.** If the service ends, the log is published
  as a static file and the domain redirects to it. Written down before the first
  customer pays, not after.

## The test

`tests/promise.test.js` fails the build if any module under `src/` requires a
network module, spawns a process, or calls `fetch`, unless that module is named
in the test's allowlist. The allowlist is empty.

Adding a module to it is the moment this document applies. Do it in a commit of
its own, with a message that answers all five conditions above. If you find
yourself adding a name to that list to get a build green, stop.
