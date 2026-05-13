import fs from "node:fs";
import path from "node:path";
import { policySchema } from "../../apps/web/src/server/safety-gate/schema";

const outputPath = path.resolve(process.cwd(), process.argv[2] ?? "worker/policy-schema.json");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(policySchema, null, 2)}\n`, "utf8");
