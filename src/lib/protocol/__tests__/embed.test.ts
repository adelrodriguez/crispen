import { afterEach, describe, expect, it, spyOn } from "bun:test"
import { readEmbed } from "../embed"

afterEach(() => {
  globalThis.__CRISPEN__ = undefined
})

describe("deployment embed", () => {
  it("reads a valid running deployment and endpoint", () => {
    globalThis.__CRISPEN__ = {
      endpoint: "/control/deployment.json",
      running: {
        builtAt: "2026-08-09T12:00:00.000Z",
        id: "abc123",
      },
      v: 1,
    }

    expect(readEmbed()).toEqual(globalThis.__CRISPEN__)
  })

  it("returns undefined when the embed is missing", () => {
    expect(readEmbed()).toBeUndefined()
  })

  it("warns and ignores a malformed embed", () => {
    let warningIssued = false
    const warning = spyOn(console, "warn").mockImplementation(() => {
      warningIssued = true
    })
    globalThis.__CRISPEN__ = {
      running: { id: "" },
      v: 1,
    }

    expect(readEmbed()).toBeUndefined()
    expect(warningIssued).toBe(true)
    expect(warning).toHaveBeenCalledTimes(1)
    warning.mockRestore()
  })
})
