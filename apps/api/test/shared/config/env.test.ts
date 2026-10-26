import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { loadEnvFile } from "../../../src/shared/config/env.js";

const dir = mkdtempSync(join(tmpdir(), "lumen-env-"));
afterAll(() => rmSync(dir, { recursive: true }));
afterEach(() => {
  delete process.env.LUMEN_ENV_TEST_REAL;
  delete process.env.LUMEN_ENV_TEST_FILE;
});

describe("loadEnvFile", () => {
  it("fills in variables from the file but never overrides a real one", () => {
    const file = join(dir, ".env");
    writeFileSync(file, "LUMEN_ENV_TEST_REAL=from-file\nLUMEN_ENV_TEST_FILE=from-file\n");
    process.env.LUMEN_ENV_TEST_REAL = "from-environment";
    loadEnvFile(file);
    expect(process.env.LUMEN_ENV_TEST_REAL).toBe("from-environment");
    expect(process.env.LUMEN_ENV_TEST_FILE).toBe("from-file");
  });

  it("does not throw when the file is missing", () => {
    expect(() => loadEnvFile(join(dir, "no-such-file"))).not.toThrow();
  });
});
