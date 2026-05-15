import { describe, expect, it } from "vitest";
import { campaignCaseHref, caseDisplay, decodeCaseRouteParam } from "../../src/lib/case-route";

describe("campaign case routes", () => {
  it("encodes generated case IDs as a single route segment", () => {
    expect(campaignCaseHref("run-1", "seed_pi_multiturn_boundary_erosion_001::adaptive-004")).toBe(
      "/campaigns/run-1/seeds/seed_pi_multiturn_boundary_erosion_001%3A%3Aadaptive-004"
    );
    expect(decodeCaseRouteParam("seed_pi_multiturn_boundary_erosion_001%3A%3Aadaptive-004")).toBe(
      "seed_pi_multiturn_boundary_erosion_001::adaptive-004"
    );
  });

  it("labels adaptive case IDs without repeating seed/seed", () => {
    expect(caseDisplay("seed_pi_multiturn_boundary_erosion_001::adaptive-004")).toEqual({
      prefix: "adaptive",
      primary: "004",
      secondary: "base pi_multiturn_boundary_erosion_001"
    });
    expect(caseDisplay("seed_tool_param_patient_swap_001")).toEqual({
      prefix: "seed",
      primary: "tool_param_patient_swap_001",
      secondary: undefined
    });
  });
});
