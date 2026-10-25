import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UsageCard } from "../../../src/shared/ui/UsageCard";

const usage = (cost_usd: number | null) => ({
  tokens_in: 10,
  tokens_out: 5,
  latency_ms: 100,
  cost_usd,
});

describe("UsageCard cost wording", () => {
  it("says 'no price set' for an unpriced model", () => {
    render(<UsageCard usage={usage(null)} />);
    expect(screen.getByText("no price set")).toBeInTheDocument();
  });
  it("shows the figure, or $0, for a priced model", () => {
    const { rerender } = render(<UsageCard usage={usage(0.0004)} />);
    expect(screen.getByText("$0.0004")).toBeInTheDocument();
    rerender(<UsageCard usage={usage(0)} />);
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.queryByText(/no price set/)).toBeNull();
  });
});
