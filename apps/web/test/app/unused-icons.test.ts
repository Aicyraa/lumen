import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Copied Animate UI icon sources are dead weight unless a page uses them through shared/ui/icons.tsx.
describe("animate-ui icon sources", () => {
  const dir = "src/shared/motion/animate-ui/icons";
  const barrel = readFileSync("src/shared/ui/icons.tsx", "utf8");
  const pages = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && f !== "shared/ui/icons.tsx" && !f.includes("animate-ui"))
    .map((f) => readFileSync(`src/${f}`, "utf8"))
    .join("\n");
  const imported = new Set(
    [...pages.matchAll(/import \{([^}]*)\} from "[^"]*shared\/ui\/icons"/g)].flatMap((m) =>
      m[1].split(",").map((x) => x.trim()),
    ),
  );
  it.each(readdirSync(dir))("%s is exported by the barrel and imported by a page", (file) => {
    const name = file.replace(/\.tsx$/, "");
    const exp = barrel.match(
      new RegExp(`export \\{ (\\w+)(?: as (\\w+))? \\} from "[^"]*/${name}"`),
    );
    expect(exp, `${name} is not exported`).toBeTruthy();
    expect(imported.has(exp![2] ?? exp![1]), `${name} is never imported`).toBe(true);
  });
});
