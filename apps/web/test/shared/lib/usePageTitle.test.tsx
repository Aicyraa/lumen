import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePageTitle } from "../../../src/shared/lib/usePageTitle";
import { PageHead } from "../../../src/shared/ui/ui";

function Page({ title }: { title: string }) {
  usePageTitle(title);
  return null;
}

describe("usePageTitle", () => {
  it("sets '<title> · Lumen', follows a changed title, and restores 'Lumen' on unmount", () => {
    document.title = "Lumen";
    const { rerender, unmount } = render(<Page title="Requests" />);
    expect(document.title).toBe("Requests · Lumen");
    rerender(<Page title="Models" />);
    expect(document.title).toBe("Models · Lumen");
    unmount();
    expect(document.title).toBe("Lumen");
  });
  it("the next page's title replaces the previous page's, never a stale one", () => {
    const a = render(<Page title="Documents" />);
    a.unmount();
    expect(document.title).toBe("Lumen");
    const b = render(<Page title="Analytics" />);
    expect(document.title).toBe("Analytics · Lumen");
    b.unmount();
  });
  it("every PageHead sets the title", () => {
    const { unmount } = render(<PageHead title="API keys" />);
    expect(document.title).toBe("API keys · Lumen");
    unmount();
    expect(document.title).toBe("Lumen");
  });
});
