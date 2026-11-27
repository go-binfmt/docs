# go-binfmt/docs

Versioned documentation for [go-binfmt](https://github.com/go-binfmt), built with
[Hugo](https://gohugo.io/) and this fleet's
[Hextra fork](https://github.com/tannevaled/hextra). Published to the
`gh-pages` branch and served at <https://go-binfmt.github.io/docs/>.

## Local preview

```bash
git submodule update --init --recursive   # themes/hextra, pinned at a release tag (v0.24.1)
hugo server                               # http://localhost:1313
```

## Versions

Each documented version is its own build under `/docs/<version>/`, and
`/docs/latest/` follows the newest. The version comes from `params.docs.version`
in `hugo.yaml`: set it to the release the pages describe (`v0.2.0` becomes
`/docs/0.2/`), or leave it at `main` while no release is tagged. The `docs`
workflow reads it, builds with that `--baseURL`, and replaces **only** that
version's path.

The site documents several tools, each with its own version, and has one number.
The rule: it is **the newest release of any tool the pages describe** (the
highest of elfpatch's and fwimg's tags), and the PR that documents a new minor of
a tool bumps it in the same change, after that tag exists, so the pages never
describe code that is not released. A patch release changes no page, so it moves
nothing. An older minor's path stays as it was built. `baseURL` in `hugo.yaml` is
kept equal to it (`v0.6.0`, `/docs/0.6/`).

The build runs with `--panicOnWarning`, so a link to a page that is not there
fails the lane instead of 404ing for a reader.
