import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockFetch, renderWithProviders } from "../test/helpers";
import { UsageMeters } from "./UsageMeters";

const usage = (d: [number, number], r: [number, number], m: [number, number]) => ({
  documents: { used: d[0], max: d[1] },
  requests_per_minute: { used: r[0], max: r[1] },
  requests_this_month: { used: m[0], max: m[1] },
});

describe("UsageMeters", () => {
  it("shows used / max exactly as the API returns them (limits never live in the front end)", async () => {
    mockFetch(() => usage([3, 7], [1, 11], [12345, 99999]));
    renderWithProviders(<UsageMeters />);
    expect(await screen.findByText("3 / 7")).toBeInTheDocument();
    expect(screen.getByText("1 / 11")).toBeInTheDocument();
    expect(screen.getByText("12,345 / 99,999")).toBeInTheDocument();
  });

  it("turns a meter amber only above 80%", async () => {
    // 81 of 100 is amber, exactly 80 of 100 is not, 5 of 10 is not
    mockFetch(() => usage([81, 100], [80, 100], [5, 10]));
    renderWithProviders(<UsageMeters />);
    await screen.findByText("81 / 100");
    expect(screen.getByRole("meter", { name: "Documents" })).toHaveAttribute("data-level", "warn");
    expect(screen.getByRole("meter", { name: "Requests / min" })).toHaveAttribute("data-level", "ok");
    expect(screen.getByRole("meter", { name: "This month" })).toHaveAttribute("data-level", "ok");
  });
});
