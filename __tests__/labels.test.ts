import { describe, expect, it } from "vitest";

import {
  describeDestination,
  destinationFor,
} from "@/lib/pipeline/destination";
import { labelFor, parseLabel } from "@/lib/pipeline/labels";

describe("tube labels", () => {
  it("round-trips", () => {
    expect(parseLabel(labelFor("S0066", 2))).toEqual({
      newId: "S0066",
      tube: 2,
    });
  });

  it("tolerates case, whitespace and scanner control characters", () => {
    expect(parseLabel(" s0066-1\r\n")).toEqual({ newId: "S0066", tube: 1 });
    expect(parseLabel("\u001dS0066-3")).toEqual({ newId: "S0066", tube: 3 });
  });

  it("rejects text that is not a tube label", () => {
    expect(parseLabel("S0066")).toBeNull();
    expect(parseLabel("41540")).toBeNull();
    expect(parseLabel("S0066-0")).toBeNull();
    expect(parseLabel("")).toBeNull();
  });
});

describe("destinations", () => {
  it("sends tube n to set n, same box number and slot", () => {
    const sets = ["Ship", "Keep2", "Keep3"];
    expect(describeDestination(destinationFor(sets, 1, "G6", 1))).toBe(
      "Ship box 1 · G6",
    );
    expect(describeDestination(destinationFor(sets, 1, "G6", 3))).toBe(
      "Keep3 box 1 · G6",
    );
  });
});
