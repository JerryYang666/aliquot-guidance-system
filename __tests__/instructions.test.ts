import { describe, expect, it } from "vitest";

import { INSTRUCTIONS, LANGUAGES } from "@/lib/client/instructions";
import { ROLES } from "@/lib/pipeline/types";

describe("role instructions", () => {
  it("has every role in every language, step for step", () => {
    for (const role of ROLES) {
      const english = INSTRUCTIONS.en.roles[role];
      expect(english.steps.length).toBeGreaterThan(0);
      for (const language of LANGUAGES) {
        const { title, steps } = INSTRUCTIONS[language].roles[role];
        expect(title).not.toBe("");
        expect(steps).toHaveLength(english.steps.length);
        expect(steps.every((step) => step.trim() !== "")).toBe(true);
      }
    }
  });

  it("names the keys and buttons the screens show, in both languages", () => {
    for (const language of LANGUAGES) {
      const { puller, labeler, aliquoter } = INSTRUCTIONS[language].roles;
      expect(puller.steps.join(" ")).toMatch(/Pulled/);
      expect(puller.steps.join(" ")).toMatch(/Returned/);
      expect(labeler.steps.join(" ")).toMatch(/Start camera/);
      expect(aliquoter.steps.join(" ")).toMatch(/Start camera/);
      expect(aliquoter.steps.join(" ")).toMatch(/New ID/);
    }
  });
});
