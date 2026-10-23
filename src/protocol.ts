// What the viewer at graphcal.org asks the extension, and what the extension
// answers. The viewer sends one request per message to the extension's id;
// every answer is an `Answer`. Requests are validated here, field by field,
// because they come from a web page: an owner, a repository, a ref, a commit
// and a path each have a shape, and nothing else is forwarded to GitHub.

export const PROTOCOL_VERSION = 1;

export type Request =
  /** Is the extension here, and which version. */
  | { v: 1; method: "hello" }
  /** The repository's default branch. */
  | { v: 1; method: "repo"; owner: string; repo: string }
  /** The commit a branch, tag or commit names now. */
  | { v: 1; method: "commit"; owner: string; repo: string; ref: string }
  /** Every file path at a commit. */
  | { v: 1; method: "tree"; owner: string; repo: string; sha: string }
  /** The text of a file at a commit. */
  | { v: 1; method: "read"; owner: string; repo: string; sha: string; path: string }
  /** Paths whose content differs between two refs. */
  | { v: 1; method: "changed"; owner: string; repo: string; base: string; head: string }
  /** The branches, tags and pull requests to switch to. */
  | { v: 1; method: "refs"; owner: string; repo: string };

/** Why a request failed, as the viewer tells them apart. */
export type Failure =
  /** The repository, ref or path does not exist, or the signed-in account cannot see it. */
  | "not_found"
  /** The repository has no branch, tag or commit of that name. */
  | "ref_not_found"
  /** The browser is not signed in to github.com. */
  | "signed_out"
  /** GitHub asked to slow down. */
  | "rate_limited"
  /** GitHub refused for another reason. */
  | "forbidden"
  /** GitHub did not answer. */
  | "network"
  | "other";

export type Answer = { ok: true; value: unknown } | { ok: false; kind: Failure; message: string };

/** A GitHub user or organization name. */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
/** A GitHub repository name. */
const REPO = /^[A-Za-z0-9._-]+$/;
/** A full commit hash. */
const SHA = /^[0-9a-f]{40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown, pattern: RegExp): string | null {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

/** A branch, tag or commit name: anything git allows that fits in a URL path. */
function refOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) return null;
  if (value.includes("..") || value.startsWith("/") || value.endsWith("/")) return null;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f || " ~^:?*[\\".includes(char)) return null;
  }
  return value;
}

/** A repository path: `/`-separated, no empty, `.` or `..` segments. */
function pathOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return null;
  const segments = value.split("/");
  if (segments.some((s) => s.length === 0 || s === "." || s === "..")) return null;
  return value;
}

function repoName(value: unknown): string | null {
  const name = text(value, REPO);
  return name === null || name === "." || name === ".." ? null : name;
}

/** The request in a message from the viewer, or null when it is not one. */
export function parseRequest(message: unknown): Request | null {
  if (!isRecord(message) || message.v !== PROTOCOL_VERSION) return null;
  const { method } = message;
  if (method === "hello") return { v: 1, method };
  const owner = text(message.owner, OWNER);
  const repo = repoName(message.repo);
  if (owner === null || repo === null) return null;
  switch (method) {
    case "repo":
    case "refs":
      return { v: 1, method, owner, repo };
    case "commit": {
      const ref = refOf(message.ref);
      return ref === null ? null : { v: 1, method, owner, repo, ref };
    }
    case "tree": {
      const sha = text(message.sha, SHA);
      return sha === null ? null : { v: 1, method, owner, repo, sha };
    }
    case "read": {
      const sha = text(message.sha, SHA);
      const path = pathOf(message.path);
      return sha === null || path === null ? null : { v: 1, method, owner, repo, sha, path };
    }
    case "changed": {
      const base = refOf(message.base);
      const head = refOf(message.head);
      return base === null || head === null ? null : { v: 1, method, owner, repo, base, head };
    }
    default:
      return null;
  }
}
