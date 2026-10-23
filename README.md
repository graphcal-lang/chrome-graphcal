# Graphcal for GitHub

A Chrome extension that lets the [Graphcal viewer](https://graphcal.org/view/) read GitHub repositories with the browser's own GitHub sign-in. No token to create or paste: a repository you can open on github.com, you can open in the viewer, private ones included.

It also adds a toolbar button. On a `.gcl` file's page on github.com, pressing it opens that file in the viewer.

## How it works

The viewer at graphcal.org keeps no data and talks to no server of its own. With the extension installed, every read of a repository goes through the extension (`externally_connectable` messaging), and the extension fetches github.com with the session cookies, the same way a GitHub page does. The sources are evaluated in the viewer's own tab, in WebAssembly, and never leave the browser.

The addresses read, all on github.com:

| What            | Address                                        | Status                           |
| --------------- | ---------------------------------------------- | -------------------------------- |
| file text       | `/{owner}/{repo}/raw/{sha}/{path}`             | the "Raw" button                 |
| branch → commit | `/{owner}/{repo}/latest-commit/{ref}` (JSON)   | the web app's own                |
| every file path | `/{owner}/{repo}/tree-list/{sha}` (JSON)       | the web app's own ("Go to file") |
| branches        | `/{owner}/{repo}/branches/all` (JSON)          | the web app's own                |
| what changed    | `/{owner}/{repo}/compare/{base}...{head}.diff` | the compare page's `.diff`       |

The web app's own addresses are not documented by GitHub and may change; `src/github.ts` is the one place that knows them. When one changes, the extension is updated and the Web Store delivers it.

Permissions: `activeTab` (the page URL when the button is pressed) and host permissions for `github.com` and `raw.githubusercontent.com` (where `raw` redirects). Nothing else; the extension stores nothing.

## Protocol

The viewer sends one message per request to the extension's id, `{ v: 1, method, ...fields }`, and gets `{ ok: true, value }` or `{ ok: false, kind, message }` back. The methods are `hello`, `repo`, `commit`, `tree`, `read`, `changed` and `refs`; `src/protocol.ts` defines and validates them. Only pages on the origins the manifest lists (`graphcal.org`, and `localhost` for development) can send them.

The extension's id is fixed by the `key` in `public/manifest.json`, so an unpacked build has the same id as the published one and the viewer needs no configuration.

## Limits

- The ref menu of the viewer lists branches only: tags and pull requests have no JSON address on github.com that the extension knows. A pull request is viewed by its head branch (`#owner/repo@main...feature/path.gcl`).
- The toolbar button opens a file's page as that file, and a repository's root or folder page as the shallowest `.gcl` under it (the explorer lists the rest). On any other page, a pull request's say, it opens the viewer's start page.
- github.com only; GitHub Enterprise Server is not supported.
- Chrome (and other Chromium browsers). Firefox has no `externally_connectable`.

## Development

```sh
pnpm install
pnpm run build        # typecheck, then dist/
pnpm run icons        # public/icons from icons.svg (needs rsvg-convert)
pnpm exec vp test
pnpm exec vp lint
pnpm run zip          # chrome-graphcal.zip for the Web Store
```

Load `dist/` as an unpacked extension at `chrome://extensions` (Developer mode → Load unpacked). Then open `https://graphcal.org/view/#owner/repo/path.gcl`, or press the button on a `.gcl` file's GitHub page.

To check the worker's reads by hand, open the extension's service worker console from `chrome://extensions` and send yourself a request:

```js
chrome.runtime.sendMessage(
  { v: 1, method: "commit", owner: "ut-issl", repo: "geox-graphcal", ref: "main" },
  console.log,
);
```

### First-run checks

Two things can only be confirmed in a running Chrome, so check them on the first load:

1. The worker's `fetch` to github.com carries the session cookies (Chrome sends them to origins the extension has host permission for). `commit` above should answer a sha for a private repository you can see.
2. Signed out of github.com, a read fails with `kind: "signed_out"` (the extension tells by whether `/settings/profile` redirects to login).

## License

MIT or Apache-2.0, at your option, like Graphcal itself.
