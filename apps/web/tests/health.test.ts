import { describe, expect, it } from "vitest";

export const healthRoutes = ["/healthz", "/readyz"] as const;

describe("health route registry", () => {
  it("tracks the externally probed health endpoints", () => {
    expect(healthRoutes).toEqual(["/healthz", "/readyz"]);
  });
});
