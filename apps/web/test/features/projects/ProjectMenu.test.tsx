import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ProjectMenu } from "../../../src/features/projects/ProjectMenu";

const projects = [
  { slug: "a", name: "Alpha" },
  { slug: "b", name: "Beta" },
  { slug: "c", name: "Gamma" },
];
function setup(onSelect = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/start"]}>
      <Routes>
        <Route
          path="/start"
          element={<ProjectMenu projects={projects} current="b" onSelect={onSelect} />}
        />
        <Route path="/projects" element={<div>projects page</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return { onSelect, trigger: screen.getByRole("button", { name: /^Project: Beta/ }) };
}

describe("ProjectMenu", () => {
  it("is a closed listbox button showing the current project", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("Beta");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens on click with options (current one selected) and All projects last", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const opts = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(opts.map((o) => o.textContent)).toEqual(["Alpha", "Beta", "Gamma", "All projects"]);
    expect(opts.map((o) => o.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
      "false",
    ]);
  });

  it("selecting a project calls onSelect with its slug and closes, focus back on the button", async () => {
    const { trigger, onSelect } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("option", { name: "Gamma" }));
    expect(onSelect).toHaveBeenCalledWith("c");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("selecting the current project only closes", async () => {
    const { trigger, onSelect } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("option", { name: "Beta" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("All projects goes to /projects", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("option", { name: "All projects" }));
    expect(screen.getByText("projects page")).toBeInTheDocument();
  });

  it("keyboard: ArrowDown opens on the current option; arrows, Home and End move; Enter selects", async () => {
    const { trigger, onSelect } = setup();
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    const list = screen.getByRole("listbox");
    expect(list).toHaveFocus();
    const active = () =>
      document.getElementById(list.getAttribute("aria-activedescendant")!)?.textContent;
    expect(active()).toBe("Beta");
    await userEvent.keyboard("{ArrowDown}");
    expect(active()).toBe("Gamma");
    await userEvent.keyboard("{End}");
    expect(active()).toBe("All projects");
    await userEvent.keyboard("{ArrowDown}"); // stays at the end
    expect(active()).toBe("All projects");
    await userEvent.keyboard("{Home}");
    expect(active()).toBe("Alpha");
    await userEvent.keyboard("{ArrowUp}"); // stays at the start
    expect(active()).toBe("Alpha");
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("a");
    expect(trigger).toHaveFocus();
  });

  it("keyboard: Enter and Space open it, ArrowUp opens it on the last entry, Escape closes", async () => {
    const { trigger } = setup();
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{ArrowUp}");
    const list = screen.getByRole("listbox");
    expect(document.getElementById(list.getAttribute("aria-activedescendant")!)).toHaveTextContent(
      "All projects",
    );
  });

  it("Space selects the active option", async () => {
    const { trigger, onSelect } = setup();
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await userEvent.keyboard(" ");
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("clicking outside closes it", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.click(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("clicking the trigger again toggles it closed", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Tab closes the list and keeps focus on the button (never on body)", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    expect(screen.getByRole("listbox")).toHaveFocus();
    await userEvent.tab();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(trigger).toHaveFocus();
  });

  it("closes when focus leaves the component", async () => {
    render(
      <MemoryRouter>
        <ProjectMenu projects={projects} current="b" onSelect={vi.fn()} />
        <button type="button">elsewhere</button>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /^Project: Beta/ }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "elsewhere" }).focus());
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("the button controls the listbox (aria-controls matches its id)", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    const list = screen.getByRole("listbox");
    expect(list.id).toBeTruthy();
    expect(trigger).toHaveAttribute("aria-controls", list.id);
  });

  it("shows 'Select project' (not the first project) when the current slug is not in the list", () => {
    render(
      <MemoryRouter>
        <ProjectMenu projects={projects} current="gone" onSelect={vi.fn()} />
      </MemoryRouter>,
    );
    const btn = screen.getByRole("button", { name: "Project: Select project" });
    expect(btn).toHaveTextContent("Select project");
    expect(btn).not.toHaveTextContent("Alpha");
  });
});
