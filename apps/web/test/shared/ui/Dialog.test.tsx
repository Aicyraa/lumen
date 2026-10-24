import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Dialog } from "../../../src/shared/ui/Dialog";

// A parent that re-renders on every keystroke and passes a fresh onClose each time, like the real pages do.
function Host() {
  const [text, setText] = useState("");
  const [n, setN] = useState(0);
  return (
    <Dialog title="Name this key" onClose={() => setText("")}>
      <input aria-label="Name" data-autofocus value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button">Other</button>
      <button type="button" onClick={() => setN(n + 1)}>Bump {n}</button>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("focuses the autofocus field once and keeps focus where the user put it across parent re-renders", async () => {
    render(<Host />);
    const user = userEvent.setup();
    expect(screen.getByLabelText("Name")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Other" }));
    expect(screen.getByRole("button", { name: "Other" })).toHaveFocus();
    await user.click(screen.getByLabelText("Name"));
    await user.keyboard("abc"); // each keystroke re-renders the host with a new onClose
    expect(screen.getByLabelText("Name")).toHaveValue("abc");
    await user.click(screen.getByRole("button", { name: /Bump/ })); // re-renders the host with a new onClose
    expect(screen.getByRole("button", { name: /Bump 1/ })).toHaveFocus(); // not pulled back to the input by an effect re-run
  });
});
