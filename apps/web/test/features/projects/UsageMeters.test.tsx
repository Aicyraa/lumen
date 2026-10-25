import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UsageMeters } from "../../../src/features/projects/UsageMeters";
import { mockFetch, renderWithProviders, reply } from "../../helpers";

const usage = (d: [number, number], r: [number, number], m: [number, number]) => ({
  documents: { used: d[0], max: d[1] },
  requests_per_minute: { used: r[0], max: r[1] },
  requests_this_month: { used: m[0], max: m[1] },
});

vi.mock("../../../src/features/auth/session", () => ({ useOrgId: () => "org_1" }));

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
    expect(screen.getByRole("meter", { name: "Requests / min" })).toHaveAttribute(
      "data-level",
      "ok",
    );
    expect(screen.getByRole("meter", { name: "This month" })).toHaveAttribute("data-level", "ok");
  });

  it("stops polling once the API says this tab's project is stale", async () => {
    mockFetch(() => reply(409, { error: { code: "project_mismatch", message: "m" } }));
    const { client } = renderWithProviders(<UsageMeters />);
    await vi.waitFor(() =>
      expect(
        client.getQueryCache().find({ queryKey: ["usage", "org_1"] })?.state.error,
      ).toBeTruthy(),
    );
    const query = client.getQueryCache().find({ queryKey: ["usage", "org_1"] })!;
    const interval = query.options.refetchInterval as (q: typeof query) => number | false;
    expect(interval(query)).toBe(false);
  });
});
