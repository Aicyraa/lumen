import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lum = (hex: string) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const token = (name: string) =>
  readFileSync("src/shared/styles/styles.css", "utf8").match(
    new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"),
  )![1];

describe("text contrast (small text must reach 4.5:1)", () => {
  it.each(["text-2", "text-3", "text-4"])("%s on the page background and on cards", (t) => {
    expect(ratio(token(t), token("bg"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(t), token("surface"))).toBeGreaterThanOrEqual(4.5);
  });

  describe("sidebar safety valve", () => {
    const css = readFileSync("src/shared/styles/styles.css", "utf8");
    it("never scrolls normally but may scroll on very short windows", () => {
      expect(css).toMatch(/\.sidebar\s*\{[^}]*overflow:\s*hidden/);
      expect(css).toMatch(
        /@media \(max-height: 560px\)\s*\{\s*\.sidebar\s*\{[^}]*overflow-y:\s*auto/,
      );
    });
  });
});

describe("Try it layout", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  it("stacks the answer and the side cards on narrow screens (the with-side rule is outranked otherwise)", () => {
    expect(css).toMatch(/\.try-grid\.with-side,[^{]*\{[^}]*grid-template-columns:\s*1fr/);
  });
  it("is centred in the content area within a comfortable max width", () => {
    expect(css).toMatch(/\.try-grid\s*\{[^}]*max-width:\s*\d+px[^}]*margin-inline:\s*auto/);
  });
});

describe("Projects grid", () => {
  it("uses three columns on wide screens", () => {
    const css = readFileSync("src/shared/styles/styles.css", "utf8");
    expect(css).toMatch(/\.cards\s*\{[^}]*repeat\(3,/);
  });
});

describe("public page layout", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  const rule = (sel: string) =>
    css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  it("the public navbar is sticky with a solid fallback background and a backdrop blur", () => {
    const all = [...css.matchAll(/\.pub-nav\s*\{([^}]*)\}/g)].map((m) => m[1]).join(";");
    expect(all).toMatch(/position:\s*sticky/);
    expect(all).toMatch(/top:\s*0/);
    expect(all).toMatch(/background:\s*var\(--bg\)/);
    expect(all).toMatch(/backdrop-filter:\s*blur/);
  });
  it("only the hero fills a screen; other snap sections take their content height", () => {
    expect(rule(".snap-section")).not.toMatch(/min-height/);
    expect(rule(".hero")).toMatch(/min-height/);
  });
});

describe("sticky nav offsets", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  it("anchors and scroll padding leave room for the sticky nav", () => {
    expect(css).not.toMatch(/scroll-padding-top:\s*16px/);
    // window-scrolled pages (home) leave room for the sticky nav; the docs scroll inside .doc-scroll, below the nav (16px)
    for (const m of css.matchAll(/scroll-(?:padding|margin)-top:\s*([^;]+);/g))
      expect(["calc(var(--nav-h) + 24px)", "16px"]).toContain(m[1]);
    expect(css).toMatch(
      /html\.snap-home\s*\{[^}]*scroll-padding-top:\s*calc\(var\(--nav-h\) \+ 24px\)/,
    );
  });
});

describe("dead CSS", () => {
  // classes built at runtime (highlight tokens, status and tier variants, logo sizes, overlay kinds)
  const runtime = /^(tk|status|logo|overlay)-/;
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(join(d, e.name))
        : /\.(tsx?|html)$/.test(e.name)
          ? [join(d, e.name)]
          : [],
    );
  it("every class selector in the stylesheet is used somewhere in src", () => {
    let css = readFileSync("src/shared/styles/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // drop declaration blocks, innermost first, so only selectors and at-rule preludes remain
    for (let prev = ""; prev !== css; ) {
      prev = css;
      css = css.replace(/\{[^{}]*\}/g, ";");
    }
    const src = [...walk("src"), "index.html"].map((f) => readFileSync(f, "utf8")).join("\n");
    const unused = [...new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]))].filter(
      (c) => !runtime.test(c) && !new RegExp(`(?<![\\w-])${c}(?![\\w-])`).test(src),
    );
    expect(unused).toEqual([]);
  });
});

describe("Home section 02 proportions", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  it("the audience box is narrower than its column, keeps larger text, and the three steps run in a horizontal line", () => {
    expect(css).toMatch(/\.audience\s*\{[^}]*max-width:\s*[1-5]\d\dpx/);
    expect(css).toMatch(/\.audience li\s*\{[^}]*font-size:\s*clamp\((?:1[789]|2\d)px/);
    expect(css).toMatch(/\.mini-steps\s*\{[^}]*grid-template-columns:\s*repeat\(3,/);
    expect(css).toMatch(/\.mini-steps\s*\{[^}]*border-top:\s*1px solid/);
  });
  it("the two columns, the routing diagram and its list are centred on each other; each step's dot and number sit at the centre of its text", () => {
    const rule = (sel: string) =>
      css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    expect(rule(".what-grid")).toMatch(/align-items:\s*center/);
    expect(rule(".route-explorer")).toMatch(/align-items:\s*center/);
    expect(rule(".mini-steps li")).toMatch(/align-items:\s*center/);
    expect(rule(".mini-steps li")).toMatch(/text-align:\s*center/);
    expect(rule(".mini-steps li::before")).toMatch(/left:\s*50%/);
  });
});

describe("Models and Documents lists", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  it("the move buttons and Remove are centred on each other", () => {
    expect(css).toMatch(/\.model-actions\s*\{[^}]*justify-content:\s*center/);
    expect(css).toMatch(
      /\.model-actions \.link-btn\s*\{[^}]*flex-basis:\s*100%;[^}]*text-align:\s*center/,
    );
  });
  it("model rows have lines only between them: no top or bottom line of their own", () => {
    for (const m of css.matchAll(/(?:^|\n)\.model-row\s*\{([^}]*)\}/g))
      expect(m[1]).not.toMatch(/border-(?:top|bottom)/);
    expect(css).toMatch(
      /\.model-row:not\(\.model-head\) \+ \.model-row\s*\{[^}]*border-top:\s*1px solid/,
    );
  });
  it("the documents list sits in a padded card whose last row has no line", () => {
    expect(css).toMatch(/\.table-card\s*\{[^}]*padding:\s*\d+px\s+\d+px/);
    expect(css).toMatch(
      /\.tr:not\(\.th\) \+ \.tr,\s*\.tr-wrap \+ \.tr-wrap\s*\{[^}]*border-top:\s*1px solid/,
    );
    expect(css).toMatch(/(?:^|\n)\.tr\s*\{(?![^}]*border-bottom)/);
  });
});

describe("Home sections 02, 03 and 05 are not rows of square cards", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  const rule = (sel: string) =>
    css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  it("feature rows, steps and routing items have no box of their own", () => {
    for (const sel of [".feature-card", ".route-item", ".mini-steps li"]) {
      expect(rule(sel), sel).not.toMatch(/border:\s*[1-9]|background:\s*var\(--surface\)/);
    }
  });
  it("the routing diagram sits beside the list of scenarios and is capped in width", () => {
    expect(rule(".route-explorer")).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*\d+px\)\s+minmax/,
    );
    expect(rule(".route-items")).toMatch(/flex-direction:\s*column/);
  });
});

describe("the same scroll, lines and motion on every screen", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  const rule = (sel: string) =>
    css.match(
      new RegExp(`(?:^|\\n)${sel.replace(/[.[\]()+>:*]/g, "\\$&")}\\s*\\{([^}]*)\\}`),
    )?.[1] ?? "";
  it("every scroller gets the thin scrollbar", () => {
    expect(rule("*")).toMatch(/scrollbar-width:\s*thin/);
    expect(rule("*")).toMatch(/scrollbar-color:\s*var\(--line-strong\)/);
  });
  it("lists draw lines only between items: none under the last row, list item or source", () => {
    expect(rule("table.data tbody tr:last-child td")).toMatch(/border-bottom:\s*0/);
    expect(rule(".list li:last-child")).toMatch(/border-bottom:\s*0/);
    expect(rule(".source:last-child")).toMatch(/border-bottom:\s*0/);
  });
  it("the routing list is square wherever an edge meets a divider and rounded only on its free outer edges", () => {
    expect(rule(".route-item")).toMatch(/border-radius:\s*0;/);
    expect(rule(".route-items li:first-child .route-item")).toMatch(
      /border-radius:\s*10px 10px 0 0/,
    );
    expect(rule(".route-items li:last-child .route-item")).toMatch(
      /border-radius:\s*0 0 10px 10px/,
    );
  });
  it("code uses the syntax colours, which exist only for code, and a fixed height when asked", () => {
    expect(css).toMatch(/--syn-blue:/);
    expect(css).toMatch(/\.code-fixed\s*\{[^}]*height:\s*calc\(var\(--min-lines\)/);
    expect(css).toMatch(/\.tk-str\s*\{[^}]*color:\s*var\(--lime-soft\)/);
  });
  it("dashboard blocks rise in turn and long pages reveal sections as they scroll in, all within 0.5 s", () => {
    expect(rule(".content .stack > *")).toMatch(/animation:\s*fade 0\.[1-5]\d*s/);
    expect(css).toMatch(
      /@supports \(animation-timeline: view\(\)\)\s*\{\s*\.doc-content section\s*\{[^}]*animation-timeline:\s*view\(\)/,
    );
  });
});
