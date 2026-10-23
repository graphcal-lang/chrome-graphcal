import { expect, test } from "vite-plus/test";
import { pageOf, pickEntry, splitRef, viewerUrl } from "./route.ts";

test("a blob page is a file page, a repository root or folder is a repo page, the rest is nothing", () => {
  expect(
    pageOf("https://github.com/ut-issl/geox-graphcal/blob/main/src/geox/a.gcl?plain=1#L3"),
  ).toEqual({
    kind: "file",
    owner: "ut-issl",
    repo: "geox-graphcal",
    segments: ["main", "src", "geox", "a.gcl"],
  });
  expect(pageOf("https://github.com/ut-issl/geox-graphcal")).toEqual({
    kind: "repo",
    owner: "ut-issl",
    repo: "geox-graphcal",
    segments: [],
  });
  expect(pageOf("https://github.com/ut-issl/geox-graphcal/tree/main/src")).toEqual({
    kind: "repo",
    owner: "ut-issl",
    repo: "geox-graphcal",
    segments: ["main", "src"],
  });
  expect(pageOf("https://github.com/ut-issl/geox-graphcal/pulls")).toBeNull();
  expect(pageOf("https://github.com/ut-issl/geox-graphcal/blob/main")).toBeNull();
  expect(pageOf("https://github.com/orgs/ut-issl/repositories")).toBeNull();
  expect(pageOf("https://github.com/ut-issl")).toBeNull();
  expect(pageOf("https://example.com/o/r/blob/main/a.gcl")).toBeNull();
  expect(pageOf("not a url")).toBeNull();
});

test("the ref is the longest branch that fits, else the first segment", () => {
  const segments = ["feat", "x", "src", "a.gcl"];
  expect(splitRef(segments, [])).toEqual({ ref: "feat", path: ["x", "src", "a.gcl"] });
  expect(splitRef(segments, ["main", "feat/x"])).toEqual({ ref: "feat/x", path: ["src", "a.gcl"] });
  // A folder page may be the branch alone.
  expect(splitRef(["feat", "x"], ["feat/x"])).toEqual({ ref: "feat/x", path: [] });
});

test("the entry for a folder is its shallowest .gcl, first by name", () => {
  const paths = [
    "README.md",
    "src/geox/system/system_params.gcl",
    "src/geox/aocs/aocs_params.gcl",
    "src/geox/geox.gcl",
    "tools/t.gcl",
  ];
  expect(pickEntry(paths, "")).toBe("tools/t.gcl");
  expect(pickEntry(paths, "src")).toBe("src/geox/geox.gcl");
  expect(pickEntry(paths, "src/geox/aocs")).toBe("src/geox/aocs/aocs_params.gcl");
  expect(pickEntry(paths, "docs")).toBeNull();
  expect(pickEntry(["a.md"], "")).toBeNull();
});

test("the viewer address encodes the ref and the path, and leaves the default branch unnamed", () => {
  expect(viewerUrl("o", "r", "feat/x", "src/a.gcl")).toBe(
    "https://graphcal.org/view/#o/r@feat%2Fx/src/a.gcl",
  );
  expect(viewerUrl("o", "r", null, "a b/c#d.gcl")).toBe(
    "https://graphcal.org/view/#o/r/a%20b/c%23d.gcl",
  );
});
