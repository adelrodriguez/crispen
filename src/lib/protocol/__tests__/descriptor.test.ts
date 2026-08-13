import { describe, expect, it } from "bun:test"
import { parseDescriptor, serializeDescriptor } from "../descriptor"
import { TargetResolutionError } from "../errors"

function getThrown(operation: () => unknown): unknown {
  try {
    operation()
  } catch (error) {
    return error
  }

  throw new Error("Expected the operation to throw")
}

describe("deployment descriptor", () => {
  it("round-trips a deployment through the v1 wire format", () => {
    const serialized = serializeDescriptor({
      builtAt: new Date("2026-08-09T12:00:00.000Z"),
      id: "abc123",
    })

    expect(serialized).toBe('{"v":1,"id":"abc123","builtAt":"2026-08-09T12:00:00.000Z"}')
    expect(parseDescriptor(serialized)).toEqual({
      builtAt: new Date("2026-08-09T12:00:00.000Z"),
      id: "abc123",
    })
  })

  it("reports an invalid-json reason and retains the invalid text", () => {
    const text = "<!doctype html><title>App</title>"
    const error = getThrown(() => parseDescriptor(text))

    expect(error).toEqual(new TargetResolutionError("invalid-json", text))
  })

  it("rejects a descriptor without a protocol version", () => {
    expect(() => parseDescriptor('{"id":"abc123"}')).toThrow(
      new TargetResolutionError("unsupported-version")
    )
  })

  it("rejects an unknown non-forward protocol version", () => {
    expect(() => parseDescriptor('{"v":0,"id":"abc123"}')).toThrow(
      new TargetResolutionError("unsupported-version")
    )
  })

  it("parses a higher protocol version when its id is usable", () => {
    expect(parseDescriptor('{"v":2,"id":"future","newField":true}')).toEqual({ id: "future" })
  })

  it("drops invalid optional build metadata", () => {
    expect(parseDescriptor('{"v":1,"id":"abc123","builtAt":"not-a-date"}')).toEqual({
      id: "abc123",
    })
  })

  it.each(['{"v":1}', '{"v":1,"id":""}'])(
    "rejects an unusable deployment id in %s",
    (descriptor) => {
      expect(() => parseDescriptor(descriptor)).toThrow(new TargetResolutionError("invalid-shape"))
    }
  )
})
