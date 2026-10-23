// The paths a unified diff touches, from GitHub's `compare/base...head.diff`.
// Each file's block opens with `diff --git a/<path> b/<path>`; the paths are
// taken from the `---`/`+++` lines (a side that is `/dev/null` was added or
// removed), from `rename from`/`rename to`, and from `Binary files` lines,
// since those name a path each without ambiguity about spaces.

const OLD = /^--- (.+)$/;
const NEW = /^\+\+\+ (.+)$/;
const RENAME_FROM = /^rename from (.+)$/;
const RENAME_TO = /^rename to (.+)$/;
const BINARY = /^Binary files (.+) and (.+) differ$/;

/** Every path added, removed, changed or renamed (both names) in `diff`. */
export function changedPaths(diff: string): Set<string> {
  const paths = new Set<string>();
  /** A path as a header writes it: `a/<path>`, `b/<path>`, quoted when unusual, or `/dev/null`. */
  const side = (text: string | undefined): void => {
    if (text === undefined || text === "/dev/null") return;
    const unquoted = unquote(text);
    if (unquoted.startsWith("a/") || unquoted.startsWith("b/")) paths.add(unquoted.slice(2));
  };
  /** A path on its own (`rename from <path>`), quoted when unusual. */
  const bare = (text: string | undefined): void => {
    if (text !== undefined) paths.add(unquote(text));
  };
  for (const line of diff.split("\n")) {
    // Inside a hunk, a removed line starting with `-- ` or an added one with
    // `++ ` would match too; such a line is kept out by `side`, since it
    // does not read `a/…`, `b/…` or `/dev/null`.
    let m: RegExpExecArray | null;
    if ((m = OLD.exec(line)) !== null) side(m[1]);
    else if ((m = NEW.exec(line)) !== null) side(m[1]);
    else if ((m = RENAME_FROM.exec(line)) !== null) bare(m[1]);
    else if ((m = RENAME_TO.exec(line)) !== null) bare(m[1]);
    else if ((m = BINARY.exec(line)) !== null) {
      side(m[1]);
      side(m[2]);
    }
  }
  return paths;
}

/** Git quotes a path with unusual characters as a C string, its bytes in octal. */
function unquote(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"') || path.length < 2) return path;
  const bytes: number[] = [];
  const inner = path.slice(1, -1);
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i] as string;
    if (c !== "\\") {
      bytes.push(...new TextEncoder().encode(c));
      continue;
    }
    const next = inner[i + 1] ?? "";
    const octal = /^[0-7]{3}/.exec(inner.slice(i + 1));
    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      i += 3;
    } else {
      const escaped = { n: 10, t: 9, '"': 34, "\\": 92 }[next];
      bytes.push(escaped ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}
