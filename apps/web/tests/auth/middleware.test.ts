import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "../../src/middleware";

describe("auth middleware", () => {
  it("redirects protected console routes without a session cookie", () => {
    const response = middleware(new NextRequest("http://localhost:3000/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fdashboard");
  });

  it("does not redirect public health routes", () => {
    const response = middleware(new NextRequest("http://localhost:3000/healthz"));

    expect(response.status).toBe(200);
  });
});
