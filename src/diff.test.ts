import { expect, test } from "vite-plus/test";
import { changedPaths } from "./diff.ts";

const DIFF = `diff --git a/src/a.gcl b/src/a.gcl
index 1111111..2222222 100644
--- a/src/a.gcl
+++ b/src/a.gcl
@@ -1,2 +1,2 @@
-param a: Power = 1.0 W
+param a: Power = 2.0 W
--- not a file header, a removed line
++ nor this one
diff --git a/new.gcl b/new.gcl
new file mode 100644
--- /dev/null
+++ b/new.gcl
@@ -0,0 +1 @@
+param n: Int = 1
diff --git a/gone.gcl b/gone.gcl
deleted file mode 100644
--- a/gone.gcl
+++ /dev/null
diff --git a/old name.gcl b/new name.gcl
similarity index 100%
rename from old name.gcl
rename to new name.gcl
diff --git a/img.png b/img.png
Binary files a/img.png and b/img.png differ
diff --git "a/sp\\303\\244ce.gcl" "b/sp\\303\\244ce.gcl"
--- "a/sp\\303\\244ce.gcl"
+++ "b/sp\\303\\244ce.gcl"
`;

test("every added, removed, changed, renamed and binary path is listed once", () => {
  expect([...changedPaths(DIFF)].sort()).toEqual([
    "gone.gcl",
    "img.png",
    "new name.gcl",
    "new.gcl",
    "old name.gcl",
    "späce.gcl",
    "src/a.gcl",
  ]);
});

test("an empty diff changes nothing", () => {
  expect(changedPaths("")).toEqual(new Set());
});
