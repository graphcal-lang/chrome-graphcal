import { describe, expect, test, vi } from "vite-plus/test";
import { GitHubSession, ReadError } from "./github.ts";

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch that answers from a script of responses and records what it was asked. */
function fakeFetch(answers: ((call: Call) => Response)[]): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: typeof fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const call = { url, init: init ?? {} };
    calls.push(call);
    const answer = answers.shift();
    if (!answer) throw new Error(`unexpected request ${url}`);
    return Promise.resolve(answer(call));
  }) as unknown as typeof fetch;
  return { fetch: fetchFn, calls };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const SHA = "3d833bbf0dbcc8cfd3f0b7b704f1c9e0094ee682";

describe("GitHubSession", () => {
  test("reads with the browser's cookies and the web app's JSON headers", async () => {
    const { fetch, calls } = fakeFetch([() => json({ oid: SHA })]);
    await expect(new GitHubSession(fetch).commit("o", "r", "feat/x")).resolves.toBe(SHA);
    expect(calls[0]?.url).toBe("https://github.com/o/r/latest-commit/feat/x");
    expect(calls[0]?.init.credentials).toBe("include");
    expect(calls[0]?.init.headers).toMatchObject({
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    });
  });

  test("the default branch is the one marked default", async () => {
    const { fetch, calls } = fakeFetch([
      () =>
        json({
          payload: {
            has_more: false,
            branches: [
              { name: "bot/x", isDefault: false },
              { name: "main", isDefault: true },
            ],
          },
        }),
    ]);
    await expect(new GitHubSession(fetch).repo("o", "r")).resolves.toEqual({
      defaultBranch: "main",
    });
    expect(calls[0]?.url).toBe("https://github.com/o/r/branches/all?page=1");
  });

  test("the tree is the paths of tree-list, a file is its raw text", async () => {
    const { fetch, calls } = fakeFetch([
      () => json({ paths: ["graphcal.toml", "src/a.gcl"] }),
      () => new Response("param a: Power = 1.0 W", { headers: { "Content-Type": "text/plain" } }),
    ]);
    const session = new GitHubSession(fetch);
    await expect(session.tree("o", "r", SHA)).resolves.toEqual(["graphcal.toml", "src/a.gcl"]);
    await expect(session.read("o", "r", SHA, "src/a b.gcl")).resolves.toBe(
      "param a: Power = 1.0 W",
    );
    expect(calls[1]?.url).toBe(`https://github.com/o/r/raw/${SHA}/src/a%20b.gcl`);
  });

  test("what changed comes from the three-dot compare diff", async () => {
    const { fetch, calls } = fakeFetch([
      () =>
        new Response("diff --git a/b.gcl b/b.gcl\n--- a/b.gcl\n+++ b/b.gcl\n@@ -1 +1 @@\n-x\n+y\n"),
    ]);
    await expect(new GitHubSession(fetch).changed("o", "r", "main", "feat/x")).resolves.toEqual([
      "b.gcl",
    ]);
    expect(calls[0]?.url).toBe("https://github.com/o/r/compare/main...feat/x.diff");
  });

  test("refs lists every page of branches and says tags and pulls are not listed", async () => {
    const { fetch } = fakeFetch([
      () => json({ payload: { has_more: true, branches: [{ name: "main", isDefault: true }] } }),
      () =>
        json({ payload: { has_more: false, branches: [{ name: "feat/x", isDefault: false }] } }),
    ]);
    const refs = await new GitHubSession(fetch).refs("o", "r");
    expect(refs.branches).toEqual(["main", "feat/x"]);
    expect(refs.failures.map((f) => f.list)).toEqual(["tags", "pulls"]);
  });

  test("a 404 is not found when signed in, and signed out otherwise", async () => {
    const notFound = fakeFetch([
      () => new Response("", { status: 404 }),
      () => new Response("", { status: 200 }),
    ]);
    await expect(new GitHubSession(notFound.fetch).tree("o", "r", SHA)).rejects.toMatchObject({
      kind: "not_found",
    });
    expect(notFound.calls[1]?.url).toBe("https://github.com/settings/profile");
    expect(notFound.calls[1]?.init.redirect).toBe("manual");
    const signedOut = fakeFetch([
      () => new Response("", { status: 404 }),
      () => Object.assign(new Response(null, { status: 200 }), { type: "opaqueredirect" }),
    ]);
    await expect(new GitHubSession(signedOut.fetch).tree("o", "r", SHA)).rejects.toMatchObject({
      kind: "signed_out",
    });
  });

  test("a missing ref, a rate limit and a refusal are told apart", async () => {
    const session = (response: Response, signedIn = true): GitHubSession =>
      new GitHubSession(
        fakeFetch([() => response, () => new Response("", { status: signedIn ? 200 : 401 })]).fetch,
      );
    await expect(
      session(new Response("", { status: 404 })).commit("o", "r", "nope"),
    ).rejects.toMatchObject({
      kind: "ref_not_found",
      message: "o/r has no branch, tag or commit nope",
    });
    await expect(
      session(new Response("", { status: 429 })).tree("o", "r", SHA),
    ).rejects.toMatchObject({
      kind: "rate_limited",
    });
    await expect(
      session(new Response("", { status: 403 })).tree("o", "r", SHA),
    ).rejects.toMatchObject({
      kind: "forbidden",
    });
    const failing: typeof fetch = () => Promise.reject(new Error("offline"));
    await expect(new GitHubSession(failing).tree("o", "r", SHA)).rejects.toMatchObject({
      kind: "network",
    });
  });

  test("ReadError carries its kind", () => {
    const error = new ReadError("forbidden", "no");
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("forbidden");
  });
});
