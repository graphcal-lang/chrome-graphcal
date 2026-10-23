// The viewer address for a GitHub page. A `.gcl` file's page becomes
// `https://graphcal.org/view/#owner/repo@ref/path`. A repository page (its
// root, or a `tree/` folder) opens one of its `.gcl` files, chosen by
// `pickEntry`; the viewer's explorer then lists the rest. Any other page
// opens the viewer's start page.
//
// GitHub writes the ref and the path in one run of segments
// (`blob/feat/x/src/a.gcl` may be branch `feat/x` or branch `feat`), so the
// caller passes the branch names it knows and the longest that fits wins;
// without them the first segment is the ref.

export const VIEWER = "https://graphcal.org/view/";

export type GitHubPage =
  /** `/owner/repo/blob/<ref and path>`. */
  | { kind: "file"; owner: string; repo: string; segments: string[] }
  /** `/owner/repo` (segments empty: the default branch) or `/owner/repo/tree/<ref and folder>`. */
  | { kind: "repo"; owner: string; repo: string; segments: string[] };

/** The reserved first segments after `/owner/repo/` that are not a ref. */
const NOT_A_REPO = new Set(["orgs", "settings", "marketplace", "topics", "login", "features"]);

/** The page a github.com URL is, or null when the viewer has nothing for it. */
export function pageOf(url: string): GitHubPage | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "github.com") return null;
  const segments = parsed.pathname
    .split("/")
    .filter((s) => s.length > 0)
    .map(decodeURIComponent);
  const [owner, repo, kind, ...rest] = segments;
  if (!owner || !repo || NOT_A_REPO.has(owner)) return null;
  if (kind === undefined) return { kind: "repo", owner, repo, segments: [] };
  if (kind === "blob" && rest.length >= 2) return { kind: "file", owner, repo, segments: rest };
  if (kind === "tree" && rest.length >= 1) return { kind: "repo", owner, repo, segments: rest };
  return null;
}

/** `segments` divided into the ref and the path: the longest of `branches` that fits, else the first segment. */
export function splitRef(
  segments: readonly string[],
  branches: readonly string[],
): { ref: string; path: string[] } {
  let ref = segments[0] ?? "";
  let pathStart = 1;
  for (const branch of branches) {
    const parts = branch.split("/");
    if (parts.length <= pathStart || parts.length > segments.length) continue;
    if (parts.every((part, i) => segments[i] === part)) {
      ref = branch;
      pathStart = parts.length;
    }
  }
  return { ref, path: segments.slice(pathStart) };
}

/**
 * The `.gcl` file to open for the folder `dir` (`""` for the whole
 * repository): the shallowest below it, the first by name among those. Null
 * when there is none.
 */
export function pickEntry(paths: readonly string[], dir: string): string | null {
  const prefix = dir === "" ? "" : `${dir}/`;
  let best: string | null = null;
  let bestDepth = Infinity;
  for (const path of paths) {
    if (!path.endsWith(".gcl") || !path.startsWith(prefix)) continue;
    const depth = path.split("/").length;
    if (depth < bestDepth || (depth === bestDepth && best !== null && path < best)) {
      best = path;
      bestDepth = depth;
    }
  }
  return best;
}

/** The viewer address of `path` in the repository, at `ref` (null: the default branch). */
export function viewerUrl(owner: string, repo: string, ref: string | null, path: string): string {
  const at = ref === null ? "" : `@${encodeURIComponent(ref)}`;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${VIEWER}#${owner}/${repo}${at}/${encoded}`;
}
