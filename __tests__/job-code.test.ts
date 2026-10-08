import { describe, expect, it } from "vitest";

import {
  formatJobCode,
  generateJobCode,
  isValidJobCode,
  JOB_CODE_ALPHABET,
  normalizeJobCode,
} from "@/lib/job-code";

describe("job codes", () => {
  it("generates 8 letters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJobCode();
      expect(isValidJobCode(code)).toBe(true);
      expect(code).not.toMatch(/[ILO]/);
    }
  });

  it("uses every letter of the alphabet", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++)
      for (const ch of generateJobCode()) seen.add(ch);
    expect([...seen].sort().join("")).toBe(JOB_CODE_ALPHABET);
  });

  it("accepts what people type", () => {
    expect(normalizeJobCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(isValidJobCode(normalizeJobCode("abcd efgh"))).toBe(true);
    expect(isValidJobCode("ABCDEFGI")).toBe(false);
    expect(isValidJobCode("ABCDEFG")).toBe(false);
  });

  it("formats as two groups of four", () => {
    expect(formatJobCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });
});
