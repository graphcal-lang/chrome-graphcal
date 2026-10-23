// The extension's one worker. It answers the viewer at graphcal.org (requests
// come through `externally_connectable`, from the origins the manifest
// lists) by reading github.com with the browser's sign-in, and it opens the
// viewer for the GitHub file page the toolbar button is pressed on.
import { GitHubSession, ReadError } from "./github.ts";
import { parseRequest, type Answer, type Request } from "./protocol.ts";
import { pageOf, pickEntry, splitRef, VIEWER, viewerUrl, type GitHubPage } from "./route.ts";

const session = new GitHubSession();

async function answer(request: Request): Promise<unknown> {
  if (request.method === "hello") return { version: chrome.runtime.getManifest().version };
  const { owner, repo } = request;
  switch (request.method) {
    case "repo":
      return session.repo(owner, repo);
    case "commit":
      return { sha: await session.commit(owner, repo, request.ref) };
    case "tree":
      return { paths: await session.tree(owner, repo, request.sha) };
    case "read":
      return { text: await session.read(owner, repo, request.sha, request.path) };
    case "changed":
      return { paths: await session.changed(owner, repo, request.base, request.head) };
    case "refs":
      return session.refs(owner, repo);
  }
}

async function handle(message: unknown): Promise<Answer> {
  const request = parseRequest(message);
  if (request === null)
    return { ok: false, kind: "other", message: "the extension did not understand the request" };
  try {
    return { ok: true, value: await answer(request) };
  } catch (error) {
    if (error instanceof ReadError) return { ok: false, kind: error.kind, message: error.message };
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, kind: "other", message };
  }
}

chrome.runtime.onMessageExternal.addListener((message: unknown, _sender, sendResponse) => {
  void handle(message).then(sendResponse);
  // The answer comes later.
  return true;
});

/**
 * The viewer address for the page the button was pressed on: a file's page
 * opens that file; a repository page opens the shallowest `.gcl` under the
 * folder shown. Branches are listed to tell the ref from the path; when
 * GitHub will not list them, the first segment is taken as the ref.
 */
async function addressOf(page: GitHubPage): Promise<string | null> {
  const { owner, repo } = page;
  let branches: string[] = [];
  try {
    branches = (await session.refs(owner, repo)).branches;
  } catch {
    // The first segment is taken as the ref.
  }
  if (page.kind === "file") {
    const { ref, path } = splitRef(page.segments, branches);
    return viewerUrl(owner, repo, ref, path.join("/"));
  }
  const at = page.segments.length === 0 ? null : splitRef(page.segments, branches);
  const ref = at === null ? (await session.repo(owner, repo)).defaultBranch : at.ref;
  const sha = await session.commit(owner, repo, ref);
  const entry = pickEntry(await session.tree(owner, repo, sha), at?.path.join("/") ?? "");
  return entry === null ? null : viewerUrl(owner, repo, at === null ? null : at.ref, entry);
}

chrome.action.onClicked.addListener((tab) => {
  void (async () => {
    const page = tab.url === undefined ? null : pageOf(tab.url);
    let url: string | null = null;
    if (page !== null) {
      try {
        url = await addressOf(page);
      } catch {
        // The start page asks for an address instead.
      }
    }
    await chrome.tabs.create({ url: url ?? VIEWER, index: tab.index + 1 });
  })();
});
