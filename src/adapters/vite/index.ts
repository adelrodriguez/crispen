import type { Plugin } from "vite"
import type { CrispenEmbed, Deployment } from "../../lib/protocol"
import { serializeDescriptor } from "../../lib/protocol"

export interface CrispenViteOptions {
  readonly deploymentId?: string
  readonly endpoint?: string
}

const DEPLOYMENT_ID_ENVIRONMENT_VARIABLES = [
  "GIT_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "CF_PAGES_COMMIT_SHA",
  "GITHUB_SHA",
] as const
const DEFAULT_ENDPOINT = "/_crispen/deployment.json"

export function crispen(options: CrispenViteOptions = {}): Plugin {
  const descriptorEndpoint = options.endpoint ?? DEFAULT_ENDPOINT
  let endpoint = descriptorEndpoint
  let deployment: Deployment | undefined

  return {
    apply: "build",
    configResolved(config) {
      if (options.endpoint === undefined) {
        endpoint = prefixBase(config.base, DEFAULT_ENDPOINT)
      }
      deployment = {
        builtAt: new Date(),
        id: resolveDeploymentId(options.deploymentId),
      }
    },
    generateBundle() {
      const currentDeployment = requireDeployment(deployment)
      const fileName = descriptorFileName(descriptorEndpoint)
      if (fileName !== undefined) {
        this.emitFile({
          fileName,
          source: serializeDescriptor(currentDeployment),
          type: "asset",
        })
      }
    },
    name: "crispen",
    transformIndexHtml() {
      const currentDeployment = requireDeployment(deployment)
      const embed: CrispenEmbed = {
        endpoint,
        running: {
          builtAt: currentDeployment.builtAt?.toISOString(),
          id: currentDeployment.id,
        },
        v: 1,
      }

      return [
        {
          children: `globalThis.__CRISPEN__=${serializeEmbed(embed)}`,
          injectTo: "head-prepend",
          tag: "script",
        },
      ]
    },
  }
}

function descriptorFileName(endpoint: string): string | undefined {
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//iu.test(endpoint)) {
    return undefined
  }

  return endpoint.replace(/^\/+/, "")
}

function requireDeployment(deployment: Deployment | undefined): Deployment {
  if (deployment === undefined) {
    throw new Error("Crispen received a Vite hook before config resolution.")
  }

  return deployment
}

function resolveDeploymentId(explicit: string | undefined): string {
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

function prefixBase(base: string, endpoint: string): string {
  if (base.length === 0 || base === "/") {
    return endpoint
  }

  return `${base.replace(/\/+$/u, "")}${endpoint}`
}

function serializeEmbed(embed: CrispenEmbed): string {
  return JSON.stringify(embed, ["v", "running", "id", "builtAt", "endpoint"])
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
}
