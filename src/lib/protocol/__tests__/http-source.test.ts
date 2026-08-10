import { afterEach, describe, expect, it, spyOn } from "bun:test"
import { createEmbeddedSource, createHttpSource, TargetResolutionError } from "../http-source"

afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.__CRISPEN__ = undefined
})

const originalFetch = globalThis.fetch

async function getRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }

  throw new Error("Expected the promise to reject")
}

describe("HTTP deployment source", () => {
  it("resolves the target descriptor without using a browser cache", async () => {
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"v":1,"id":"target"}', {
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    )
    const source = createHttpSource({ id: "running" }, "/_crispen/deployment.json")
    const controller = new AbortController()

    const target = await source.resolveTarget(controller.signal)

    expect(target).toEqual({ id: "target" })
    expect(fetch).toHaveBeenCalledWith("/_crispen/deployment.json", {
      cache: "no-store",
      signal: controller.signal,
    })
  })

  it("reports a network failure with its typed reason", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"))
    const source = createHttpSource({ id: "running" }, "/deployment.json")

    const error = await getRejection(source.resolveTarget(new AbortController().signal))

    expect(error).toEqual(new TargetResolutionError("network"))
  })

  it("rejects an unsuccessful HTTP response before reading its body", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"v":1,"id":"target"}', {
        headers: { "content-type": "application/json" },
        status: 503,
      })
    )
    const source = createHttpSource({ id: "running" }, "/deployment.json")

    const error = await getRejection(source.resolveTarget(new AbortController().signal))

    expect(error).toEqual(new TargetResolutionError("http-status"))
  })

  it("rejects an HTML SPA fallback before descriptor parsing", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html><title>App</title>", {
        headers: { "content-type": "text/html" },
      })
    )
    const source = createHttpSource({ id: "running" }, "/deployment.json")

    const error = await getRejection(source.resolveTarget(new AbortController().signal))

    expect(error).toEqual(new TargetResolutionError("not-json"))
  })

  it("propagates an abort from fetch", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError")
    spyOn(globalThis, "fetch").mockRejectedValue(abortError)
    const source = createHttpSource({ id: "running" }, "/deployment.json")

    const error = await getRejection(source.resolveTarget(new AbortController().signal))

    expect(error).toBe(abortError)
  })

  it("creates the default source from the deployment embed", () => {
    globalThis.__CRISPEN__ = {
      running: {
        builtAt: "2026-08-09T12:00:00.000Z",
        id: "running",
      },
      v: 1,
    }

    expect(createEmbeddedSource()?.running).toEqual({
      builtAt: new Date("2026-08-09T12:00:00.000Z"),
      id: "running",
    })
  })
})
