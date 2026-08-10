import { describe, expect, it } from "bun:test"
import { exactMatch } from "../policies"

describe("exact deployment policy", () => {
  it.each([
    ["same", "same", "current"],
    ["running", "target", "stale"],
  ] as const)("classifies running %s and target %s as %s", (running, target, expected) => {
    expect(exactMatch()({ id: running }, { id: target })).toBe(expected)
  })
})
