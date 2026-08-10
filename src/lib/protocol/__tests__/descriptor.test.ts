import { describe, expect, it } from "bun:test"
import { DescriptorError, parseDescriptor, serializeDescriptor } from "../descriptor"

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

  it("reports an invalid-json reason for an HTML fallback", () => {
    expect(() => parseDescriptor("<!doctype html><title>App</title>")).toThrow(
      new DescriptorError("invalid-json")
    )
  })

  it("rejects a descriptor without a protocol version", () => {
    expect(() => parseDescriptor('{"id":"abc123"}')).toThrow(
      new DescriptorError("unsupported-version")
    )
  })

  it("rejects an unknown non-forward protocol version", () => {
    expect(() => parseDescriptor('{"v":0,"id":"abc123"}')).toThrow(
      new DescriptorError("unsupported-version")
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
      expect(() => parseDescriptor(descriptor)).toThrow(new DescriptorError("invalid-shape"))
    }
  )
})
