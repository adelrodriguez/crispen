import type { CrispenEmbed } from "../lib/protocol/embed"

export { DEFAULT_DESCRIPTOR_ENDPOINT } from "../lib/protocol/http-source"

const DEPLOYMENT_ID_ENVIRONMENT_VARIABLES = [
  "GIT_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "CF_PAGES_COMMIT_SHA",
  "GITHUB_SHA",
] as const

export function checkIsExternalEndpoint(endpoint: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:)?\/\//iu.test(endpoint)
}

export function resolveDeploymentId(explicit: string | undefined): string {
  if (explicit !== undefined && explicit.length > 0) {
    return explicit
  }

  for (const variable of DEPLOYMENT_ID_ENVIRONMENT_VARIABLES) {
    const value = process.env[variable]
    if (value !== undefined && value.length > 0) {
      return value
    }
  }

  return crypto.randomUUID().replaceAll("-", "")
}

export function resolvePublicEndpoint(base: string, endpoint: string): string {
  if (checkIsExternalEndpoint(endpoint)) {
    return endpoint
  }

  const rootedEndpoint = `/${endpoint.replace(/^\/+/, "")}`
  if (!base.startsWith("/") || base === "/") {
    return rootedEndpoint
  }

  return `${base.replace(/\/+$/u, "")}${rootedEndpoint}`
}

export function serializeEmbed(embed: CrispenEmbed): string {
  return JSON.stringify(embed, ["v", "running", "id", "builtAt", "endpoint"])
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
}
