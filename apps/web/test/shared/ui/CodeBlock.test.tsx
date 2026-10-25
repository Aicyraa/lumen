import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { highlight } from "../../../src/shared/ui/highlight";
import { CodeBlock } from "../../../src/shared/ui/PublicLayout";

vi.mock("../../../src/shared/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

const kinds = (code: string, lang: Parameters<typeof highlight>[1]) =>
  highlight(code, lang)
    .flat()
    .filter((t) => t.kind)
    .map((t) => [t.kind, t.text]);

describe("highlight", () => {
  it("colours a curl command: command, flags, variables and quoted strings", () => {
    expect(kinds(`curl -X POST $LUMEN_URL/v1/chat \\\n  -H "x-api-key: $K"`, "bash")).toEqual([
      ["kw", "curl"],
      ["flag", "-X"],
      ["var", "$LUMEN_URL"],
      ["flag", "-H"],
      ["str", `"x-api-key: $K"`],
    ]);
  });

  it("colours JSON keys apart from string values, numbers and literals", () => {
    expect(kinds(`{ "a": "b", "n": 0.78, "ok": true }`, "json")).toEqual([
      ["key", `"a"`],
      ["str", `"b"`],
      ["key", `"n"`],
      ["num", "0.78"],
      ["key", `"ok"`],
      ["kw", "true"],
    ]);
  });

  it("colours an HTTP request: method, path and header name, then the JSON body", () => {
    const k = kinds(`POST /v1/chat\nx-api-key: lum_1\n\n{ "query": "q" }`, "http");
    expect(k.slice(0, 3)).toEqual([
      ["kw", "POST"],
      ["path", "/v1/chat"],
      ["key", "x-api-key"],
    ]);
    expect(k).toContainEqual(["key", `"query"`]);
  });

  it("colours JavaScript and Python keywords, calls, keys and comments", () => {
    expect(kinds(`const r = await fetch("u", { method: "POST" }); // go`, "js")).toEqual([
      ["kw", "const"],
      ["kw", "await"],
      ["fn", "fetch"],
      ["str", `"u"`],
      ["key", "method"],
      ["str", `"POST"`],
      ["comment", "// go"],
    ]);
    expect(kinds(`import os\nr = requests.post(json={"q": 1})  # hi`, "python")).toEqual([
      ["kw", "import"],
      ["fn", "post"],
      ["key", "json"],
      ["key", `"q"`],
      ["num", "1"],
      ["comment", "# hi"],
    ]);
  });

  it("never changes the text, keeps blank lines, and plain text has no colours", () => {
    const code = `a = 1\n\nprint("x")\n  indented`;
    const lines = highlight(code, "python");
    expect(lines).toHaveLength(4);
    expect(
      lines
        .flat()
        .map((t) => t.text)
        .join(""),
    ).toBe(code);
    expect(highlight("no colours here", "text").flat()).toEqual([{ text: "no colours here" }]);
  });
});

describe("CodeBlock", () => {
  const code = `curl -X POST $URL\n  -d '{}'`;

  it("a copyable block is a window with dots, the language and a Copy button that copies the exact text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = render(
      <CodeBlock copyable lang="bash" testId="c">
        {code}
      </CodeBlock>,
    );
    expect(container.querySelector(".term .term-dots")).not.toBeNull();
    expect(container.querySelector(".term-title")).toHaveTextContent("bash");
    expect(screen.getByTestId("c").textContent).toBe(code);
    expect(container.querySelectorAll(".ln")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(writeText).toHaveBeenCalledWith(code);
  });

  it("without copyable only the highlighted <pre> is returned, for a parent that draws the window", () => {
    const { container } = render(<CodeBlock lang="json">{`{ "a": 1 }`}</CodeBlock>);
    expect(container.querySelector(".term")).toBeNull();
    expect(container.querySelector("pre.code .tk-key")).toHaveTextContent('"a"');
  });

  it("minLines fixes the height to that many lines", () => {
    const { container } = render(<CodeBlock minLines={10}>{"one line"}</CodeBlock>);
    const pre = container.querySelector("pre")!;
    expect(pre).toHaveClass("code-fixed");
    expect(pre.style.getPropertyValue("--min-lines")).toBe("10");
  });
});
