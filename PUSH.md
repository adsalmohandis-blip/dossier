# Two commands to go live

## 1. Create the empty repo on GitHub

Open https://github.com/new and create **dossier** under `adsalmohandis-blip`.
Public. Do **not** add a README, .gitignore or licence — this repo already has them.

## 2. Push

```bash
cd dossier
git remote add origin https://github.com/adsalmohandis-blip/dossier.git
git branch -M main
git push -u origin main
```

CI runs on push and should go green on Node 18, 20 and 22.

## 3. Turn on the site (optional, 30 seconds)

Settings -> Pages -> Source: *Deploy from a branch* -> `main` / `/site`.
The landing page is at `site/index.html`.

Before it goes live, connect a form endpoint in `site/index.html`
(search for "Plug in a form endpoint") or delete the form and link to
`docs/cra-firmware-checklist.md` instead.

## 4. Publish to npm (when you are ready)

```bash
npm login
npm publish --access public
```

The package name is `dossier-cli`. Check it is still free first:

```bash
npm view dossier-cli
```

If it is taken, change `name` in package.json before publishing. The command
stays `dossier` either way, because that is set by the `bin` field.

## Before you publish, decide one thing

Publishing claims the name permanently and makes the code public under MIT.
That is the documented strategy — open core, free layer as the distribution
channel — but it is a one-way door. Nothing in the repo is secret, but once
`npm publish` runs you cannot unpublish cleanly after 72 hours.
