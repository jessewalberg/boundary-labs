import { describe, expect, it } from "vitest";

export const smokeRoutes = ["/", "/dashboard", "/campaigns", "/campaigns/new", "/design-system"] as const;

describe("smoke route registry", () => {
  it("keeps the primary UI routes in the smoke set", () => {
    expect(smokeRoutes).toEqual(["/", "/dashboard", "/campaigns", "/campaigns/new", "/design-system"]);
  });
});
