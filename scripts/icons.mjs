// The extension's icons: Graphcal's mark (icons.svg, the same file as the
// viewer's favicon and the VS Code extension's icon) rasterized by
// rsvg-convert. `node scripts/icons.mjs` writes public/icons/{16,32,48,128}.png.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "icons.svg");
const out = join(root, "public", "icons");
mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  execFileSync("rsvg-convert", [
    "-w",
    `${size}`,
    "-h",
    `${size}`,
    "-o",
    join(out, `${size}.png`),
    source,
  ]);
}
console.log(`wrote ${out}/{16,32,48,128}.png from icons.svg`);
