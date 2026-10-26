export type Lang = "text" | "bash" | "js" | "python" | "json" | "http";
type Token = { kind?: string; text: string };

type Rule = readonly [kind: string, re: RegExp];

const KEY = /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y;
const STR = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/y;
const NUM = /-?\b\d+(?:\.\d+)?\b/y;
const FN = /[A-Za-z_]\w*(?=\()/y;
const JSON_RULES: Rule[] = [
  ["key", KEY],
  ["str", STR],
  ["num", NUM],
  ["kw", /\b(?:true|false|null)\b/y],
];

// Sticky regexes tried in order at each position; the first match wins and anything unmatched stays plain.
const RULES: Record<Lang, Rule[]> = {
  text: [],
  json: JSON_RULES,
  http: [
    ["kw", /^(?:GET|POST|PUT|PATCH|DELETE)(?=\s)/my],
    ["path", /\/[\w/:.-]+/y],
    ["key", /^[\w-]+(?=:)/my],
    ...JSON_RULES,
  ],
  bash: [
    ["comment", /#.*/y],
    ["str", /"(?:[^"\\]|\\.)*"|'[^']*'/y],
    ["var", /\$\{?\w+\}?/y],
    ["flag", /(?<=\s)--?[A-Za-z][\w-]*/y],
    ["kw", /\bcurl\b/y],
  ],
  js: [
    ["comment", /\/\/.*/y],
    ["key", KEY],
    ["str", STR],
    ["num", NUM],
    ["kw", /\b(?:const|let|var|await|async|new|return|import|from|function)\b/y],
    ["fn", FN],
    ["key", /[A-Za-z_]\w*(?=\s*:)/y],
  ],
  python: [
    ["comment", /#.*/y],
    ["key", KEY],
    ["str", STR],
    ["num", NUM],
    ["kw", /\b(?:import|from|as|def|return|print|True|False|None)\b/y],
    ["fn", FN],
    ["key", /[A-Za-z_]\w*(?==(?!=))/y],
  ],
};

// Splits code into coloured tokens, then into lines (the newline stays at the end of its line, so the text is unchanged).
export function highlight(code: string, lang: Lang): Token[][] {
  const rules = RULES[lang];
  const lines: Token[][] = [[]];
  const push = (kind: string | undefined, text: string) => {
    const parts = text.split("\n");
    parts.forEach((part, i) => {
      const line = lines[lines.length - 1];
      if (i < parts.length - 1) {
        line.push({ kind, text: `${part}\n` });
        lines.push([]);
      } else if (part) line.push({ kind, text: part });
    });
  };
  let plain = "";
  let i = 0;
  while (i < code.length) {
    let hit: [string, string] | null = null;
    for (const [kind, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m?.[0]) {
        hit = [kind, m[0]];
        break;
      }
    }
    if (hit) {
      push(undefined, plain);
      plain = "";
      push(hit[0], hit[1]);
      i += hit[1].length;
    } else plain += code[i++];
  }
  push(undefined, plain);
  return lines;
}
