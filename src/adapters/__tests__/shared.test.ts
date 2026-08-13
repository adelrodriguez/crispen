import { describe, expect, it } from "bun:test"
import { checkIsExternalEndpoint } from "../shared"

describe("checkIsExternalEndpoint", () => {
  it.each([
    "https://control.example/deployment.json",
    "HTTP://control.example/deployment.json",
    "custom+scheme://control.example/deployment.json",
    "//control.example/deployment.json",
  ])("identifies %s as external", (endpoint) => {
    expect(checkIsExternalEndpoint(endpoint)).toBe(true)
  })

  it.each([
    "/_crispen/deployment.json",
    "deployment.json",
    "./deployment.json",
    "../deployment.json",
    "https:/control.example/deployment.json",
  ])("identifies %s as local", (endpoint) => {
    expect(checkIsExternalEndpoint(endpoint)).toBe(false)
  })
})
