# ADMIT identity, as used in Dossier

Source: **ANX-BRND-TPL-001 — ADMIT Corporate Email Template, Design Spec V1.1**, approved
by the founder on 19 November 2026. Evidence grade: documented. The values below were taken
from that spec, which states that they were themselves sampled from approved artwork rather
than guessed. Nothing here was eyedropped from a screenshot or inferred from a web page.

Anything not in this file is not approved. If Dossier needs a token that is not listed,
the spec is the place to add it, not this file.

## Colour

| Token | Value | Where it is used here |
| --- | --- | --- |
| Primary purple | `#581970` | header band, footer band, headings, link text, table caption bars |
| Accent orange | `#F3AA1F` | the 3px rule under the header, left rules on callouts, eyebrow labels, the seal in the Dossier mark |
| Page background | `#F7F3F9` | the canvas the card sits on |
| Hairline border | `#DED4E3` | card and table borders |
| Row tint | `#FBF9FC` | alternating rows, callout backgrounds |
| Row divider | `#EFE8F2` | separators inside a card |
| Body text | `#2E2A32` | |
| Muted text | `#6B6470` | |
| On purple | `#E7D9EE` primary · `#B79BC6` sub-line · `#8F6DA2` separators · `#FFFFFF` links | |

A note for whoever comes next: `#2A0A36` appears as the `theme-color` meta tag on
admitnexus.com. **It is not the brand purple.** It was used here by mistake before the
approved spec was found, and every surface was corrected on 20 November 2026.

## Type

Segoe UI, Arial, Helvetica. No web fonts are loaded: the stack resolves locally, which also
keeps the pages fast and the receipts self-contained.

Eyebrow labels are 11px, uppercase, 1.4px letter-spacing, orange, bold. Headings are purple
and bold. Recorded values — hashes, dates, gate names, commands — are set in a monospace
stack, which is an extension for this product rather than part of the approved spec: it marks
the difference between prose and a value that was recorded.

## Logo

`src/assets/admit-logo.png` and `docs/assets/admit-logo.png` are the approved header asset,
`ANX-BRND-TPL-001_ASSET_header_logo_420px.png`, 420×173. It is white and orange on brand
purple and carries **no transparency**, so it must be placed on the purple band it was drawn
for. Do not place it on a light background and do not recolour it.

The file is committed here rather than linked from admitnexus.com. A page that fetches its
logo from another host shows a broken image the day that host changes, and that is exactly
what happened before it was committed.

## Layout

The approved spec describes a 640px email card because mail clients demand it. The site
card is wider; every other rule carries over: 10px card radius, 1px `#DED4E3` border,
purple band at the top with a 3px orange rule beneath it, purple band at the bottom.

## Contact

`info@admitnexus.com` is the approved address for client-facing mail. It is the only
address that may appear in this repository, and `tests/promise.test.js` fails the build if
another `@admitnexus.com` address appears anywhere in `src/`, `docs/`, `README.md` or
`RECEIPTS.md`.
