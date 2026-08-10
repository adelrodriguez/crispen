import { cp, copyFile, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { expect, test, type Page } from "@playwright/test"
import type { ExampleName } from "../../scripts/example-build"
import { activateBuild } from "../../scripts/deployment-files"

test.beforeEach(async ({ page }, testInfo) => {
  const example = readExample(testInfo.project.name)
  await activate(example, "A")
  await page.goto("/?seam=1")
  await expect(page.getByTestId("status")).toHaveText("current")
})

test("detects a deployment and recovers after reload", async ({ page }, testInfo) => {
  const example = readExample(testInfo.project.name)
  await activate(example, "B")

  await page.getByRole("button", { name: "Check now" }).click()
  await expect(page.getByTestId("status")).toHaveText("stale")
  await expect(page.getByTestId("running-id")).toHaveText("A")
  await expect(page.getByTestId("target-id")).toHaveText("B")

  await page.getByRole("button", { name: "Reload deployment" }).click()
  await expect(page.getByTestId("status")).toHaveText("current")
  await expect(page.getByTestId("running-id")).toHaveText("B")
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("crispen:reload"))).toBeNull()
})

test("blocks a mixed-version reload loop", async ({ page }, testInfo) => {
  const example = readExample(testInfo.project.name)
  await activateMixedBuild(example)

  await attemptReload(page, 3)

  await expect(page.getByTestId("reload-status")).toHaveText("blocked")
})

test("surfaces an SPA fallback without changing durable status", async ({ page }, testInfo) => {
  const example = readExample(testInfo.project.name)
  await activateFallbackBuild(example)

  await page.getByRole("button", { name: "Check now" }).click()

  await expect(page.getByTestId("status")).toHaveText("current")
  await expect(page.getByText(/Could not resolve target deployment: not-json/u)).toBeVisible()
})

test("checks when connectivity returns", async ({ context, page }, testInfo) => {
  const example = readExample(testInfo.project.name)
  await context.setOffline(true)
  await activate(example, "B")
  await context.setOffline(false)

  await expect(page.getByTestId("status")).toHaveText("stale")
  await expect(page.getByTestId("target-id")).toHaveText("B")
})

async function activate(example: ExampleName, id: string): Promise<void> {
  const root = resolve("examples", example)
  await activateBuild(root, resolve(root, "builds", id))
}

async function activateFallbackBuild(example: ExampleName): Promise<void> {
  const root = resolve("examples", example)
  const fallback = resolve(root, "builds/fallback")
  await rm(fallback, { force: true, recursive: true })
  await cp(resolve(root, "builds/A"), fallback, { recursive: true })
  await rm(resolve(fallback, "_crispen/deployment.json"))
  await activateBuild(root, fallback)
}

async function activateMixedBuild(example: ExampleName): Promise<void> {
  const root = resolve("examples", example)
  const mixed = resolve(root, "builds/mixed")
  await rm(mixed, { force: true, recursive: true })
  await cp(resolve(root, "builds/A"), mixed, { recursive: true })
  await copyFile(
    resolve(root, "builds/B/_crispen/deployment.json"),
    resolve(mixed, "_crispen/deployment.json")
  )
  await activateBuild(root, mixed)
}

function readExample(project: string): ExampleName {
  if (project === "vite-react" || project === "nextjs") {
    return project
  }
  throw new Error(`Unknown example project: ${project}`)
}

async function attemptReload(page: Page, remaining: number) {
  if (remaining === 0) {
    return
  }
  await page.getByRole("button", { name: "Check now" }).click()
  await expect(page.getByTestId("status")).toHaveText("stale")
  await page.getByRole("button", { name: "Reload deployment" }).click()
  await attemptReload(page, remaining - 1)
}
