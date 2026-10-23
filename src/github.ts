// Reads of github.com with the browser's own sign-in: the same addresses the
// GitHub web app uses, fetched with the session cookies, so a repository the
// signed-in account can open in a tab can be read here too. No token exists.
//
//   branches/all      (JSON)  the branches, the default one marked
//   latest-commit/ref (JSON)  the commit a ref names now
//   tree-list/sha     (JSON)  every file path at a commit ("Go to file")
//   raw/sha/path             a file's text (the "Raw" button)
//   compare/a...b.diff       what changed between two refs
//
// `raw` is the one GitHub documents; the others are the web app's own and
// may change without notice. When one does, this file is what follows it.
import { changedPaths } from "./diff.ts";
import type { Failure } from "./protocol.ts";

const ORIGIN = "https://github.com";

export class ReadError extends Error {
  readonly kind: Failure;
  constructor(kind: Failure, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface RepoInfo {
  defaultBranch: string;
}

export interface Refs {
  branches: string[];
  tags: string[];
  pulls: { number: number; title: string; ref: string }[];
  failures: { list: "branches" | "tags" | "pulls"; kind: Failure | null; message: string }[];
}

/** A branch, as `branches/all` lists it. */
interface Branch {
  name: string;
  isDefault: boolean;
}

/** `ref` as a URL path: slashes kept, the rest encoded. */
function refPath(ref: string): string {
  return ref.split("/").map(encodeURIComponent).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class GitHubSession {
  private readonly fetchFn: typeof fetch;
  constructor(fetchFn: typeof fetch = (input, init) => fetch(input, init)) {
    this.fetchFn = fetchFn;
  }

  /** The repository's default branch; `not_found` when the account cannot see it. */
  async repo(owner: string, repo: string): Promise<RepoInfo> {
    const branches = await this.branchesPage(owner, repo, 1);
    const main = branches.branches.find((b) => b.isDefault) ?? branches.branches[0];
    if (!main) throw new ReadError("other", `${owner}/${repo} lists no branch`);
    return { defaultBranch: main.name };
  }

  /** The commit `ref` names now. */
  async commit(owner: string, repo: string, ref: string): Promise<string> {
    let data: unknown;
    try {
      data = await this.json(`/${owner}/${repo}/latest-commit/${refPath(ref)}`);
    } catch (error) {
      if (error instanceof ReadError && error.kind === "not_found") {
        throw new ReadError(
          "ref_not_found",
          `${owner}/${repo} has no branch, tag or commit ${ref}`,
        );
      }
      throw error;
    }
    const oid = isRecord(data) ? data.oid : undefined;
    if (typeof oid !== "string" || !/^[0-9a-f]{40}$/.test(oid)) {
      throw new ReadError("other", `GitHub named no commit for ${ref}`);
    }
    return oid;
  }

  /** Every file path at the commit `sha`. */
  async tree(owner: string, repo: string, sha: string): Promise<string[]> {
    const data = await this.json(`/${owner}/${repo}/tree-list/${sha}`);
    const paths = isRecord(data) ? data.paths : undefined;
    if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) {
      throw new ReadError("other", "GitHub listed the tree in an unexpected form");
    }
    return paths;
  }

  /** The text of `path` at the commit `sha`. */
  async read(owner: string, repo: string, sha: string, path: string): Promise<string> {
    const url = `${ORIGIN}/${owner}/${repo}/raw/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const response = await this.send(url, {});
    if (!response.ok) throw await this.failure(response, `${path} at ${sha.slice(0, 7)}`);
    // A private file the account cannot see, or a signed-out browser, gets
    // GitHub's HTML 404 page with status 200 only after a redirect to login;
    // either way the text is not the file.
    const type = response.headers.get("Content-Type") ?? "";
    if (type.includes("text/html")) {
      throw new ReadError(
        (await this.signedIn()) ? "not_found" : "signed_out",
        `GitHub answered a page instead of ${path}`,
      );
    }
    return response.text();
  }

  /** Repository paths whose content differs between `base` and `head` (added, removed, changed, renamed). */
  async changed(owner: string, repo: string, base: string, head: string): Promise<string[]> {
    const url = `${ORIGIN}/${owner}/${repo}/compare/${refPath(base)}...${refPath(head)}.diff`;
    const response = await this.send(url, { headers: { Accept: "text/plain" } });
    if (!response.ok) throw await this.failure(response, `${base}...${head}`);
    return [...changedPaths(await response.text())].sort();
  }

  /**
   * The branches (every page of `branches/all`). Tags and pull requests have
   * no JSON address on github.com the extension knows; they are reported as
   * not listed, and the viewer says so in its ref menu.
   */
  async refs(owner: string, repo: string): Promise<Refs> {
    const branches: string[] = [];
    try {
      for (let page = 1; page <= 10; page++) {
        const listed = await this.branchesPage(owner, repo, page);
        branches.push(...listed.branches.map((b) => b.name));
        if (!listed.hasMore) break;
      }
    } catch (error) {
      const kind = error instanceof ReadError ? error.kind : null;
      const message = error instanceof Error ? error.message : String(error);
      return {
        branches,
        tags: [],
        pulls: [],
        failures: [{ list: "branches", kind, message }],
      };
    }
    const unlisted = "the Graphcal extension lists branches only";
    return {
      branches,
      tags: [],
      pulls: [],
      failures: [
        { list: "tags", kind: null, message: unlisted },
        { list: "pulls", kind: null, message: unlisted },
      ],
    };
  }

  private async branchesPage(
    owner: string,
    repo: string,
    page: number,
  ): Promise<{ branches: Branch[]; hasMore: boolean }> {
    const data = await this.json(`/${owner}/${repo}/branches/all?page=${page}`);
    const payload = isRecord(data) && isRecord(data.payload) ? data.payload : null;
    const listed = payload?.branches;
    if (!Array.isArray(listed))
      throw new ReadError("other", "GitHub listed branches in an unexpected form");
    const branches: Branch[] = [];
    for (const item of listed) {
      if (isRecord(item) && typeof item.name === "string") {
        branches.push({ name: item.name, isDefault: item.isDefault === true });
      }
    }
    return { branches, hasMore: payload?.has_more === true };
  }

  /** A JSON answer of the GitHub web app (what its own pages fetch). */
  private async json(path: string): Promise<unknown> {
    const response = await this.send(`${ORIGIN}${path}`, {
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    });
    if (!response.ok) throw await this.failure(response, path);
    try {
      return await response.json();
    } catch {
      throw new ReadError("other", `GitHub answered ${path} with something other than JSON`);
    }
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, {
        ...init,
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      throw new ReadError("network", `GitHub did not answer (${why})`);
    }
  }

  /** Whether the browser is signed in to github.com: the settings page is shown, not redirected to login. */
  private async signedIn(): Promise<boolean> {
    try {
      const response = await this.fetchFn(`${ORIGIN}/settings/profile`, {
        credentials: "include",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      return response.type !== "opaqueredirect" && response.status === 200;
    } catch {
      return false;
    }
  }

  private async failure(response: Response, what: string): Promise<ReadError> {
    const { status } = response;
    if (status === 429)
      return new ReadError("rate_limited", "GitHub asked to slow down; try again in a minute");
    if (status === 404) {
      // GitHub answers 404, not 403, for what the account may not see.
      return (await this.signedIn())
        ? new ReadError("not_found", `not found on GitHub: ${what}`)
        : new ReadError("signed_out", "sign in to github.com in this browser, then reload");
    }
    if (status === 401)
      return new ReadError("signed_out", "sign in to github.com in this browser, then reload");
    if (status === 403) return new ReadError("forbidden", `GitHub refused: ${what}`);
    return new ReadError("other", `GitHub answered HTTP ${status} for ${what}`);
  }
}
