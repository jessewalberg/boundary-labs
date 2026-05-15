import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("regression harness documentation links", () => {
  it("keeps the runbook and linked regression surfaces present", () => {
    const root = path.resolve(process.cwd(), "../..");

    expect(fs.existsSync(path.join(root, "docs/runbooks/regression-harness.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "evals/cases/regression/.gitkeep"))).toBe(true);
    expect(fs.existsSync(path.join(root, "apps/web/src/app/(app)/regressions/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(root, "apps/web/src/app/(app)/regressions/[caseId]/page.tsx"))).toBe(true);

    const evalsReadme = fs.readFileSync(path.join(root, "evals/README.md"), "utf8");
    expect(evalsReadme).toContain("../docs/runbooks/regression-harness.md");
  });
});
