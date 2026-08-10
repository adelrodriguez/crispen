import type { NextApiRequest, NextApiResponse, NextConfig } from "next"
import type { ReactNode } from "react"
import Script from "next/script.js"
import { createElement } from "react"
import type { CrispenEmbed, Deployment } from "../../lib/protocol"
import { serializeDescriptor } from "../../lib/protocol"

export interface CrispenNextOptions {
  readonly deploymentId?: string
  readonly endpoint?: string
}

const EMBED_ENVIRONMENT_KEY = "CRISPEN_NEXT_EMBED"
const DESCRIPTOR_ENVIRONMENT_KEY = "CRISPEN_NEXT_DESCRIPTOR"
const DEFAULT_ENDPOINT = "/_crispen/deployment.json"
const DEPLOYMENT_ID_ENVIRONMENT_VARIABLES = [
  "GIT_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "CF_PAGES_COMMIT_SHA",
  "GITHUB_SHA",
] as const

export function CrispenScript(): ReactNode {
  const embed = process.env[EMBED_ENVIRONMENT_KEY]
  if (embed === undefined || embed.length === 0) {
    return null
  }

  return createElement(Script, {
    dangerouslySetInnerHTML: {
      __html: `globalThis.__CRISPEN__=${escapeScriptText(embed)}`,
    },
    id: "crispen-deployment",
    strategy: "beforeInteractive",
  })
}

export function GET(): Response {
  const descriptor = process.env[DESCRIPTOR_ENVIRONMENT_KEY]

  return new Response(descriptor ?? '{"error":"descriptor unavailable"}', {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status: descriptor === undefined || descriptor.length === 0 ? 404 : 200,
  })
}

export function crispenPagesHandler(_request: NextApiRequest, response: NextApiResponse): void {
  const descriptor = process.env[DESCRIPTOR_ENVIRONMENT_KEY]
  response.setHeader("Cache-Control", "no-store")
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response
    .status(descriptor === undefined || descriptor.length === 0 ? 404 : 200)
    .end(descriptor ?? '{"error":"descriptor unavailable"}')
}

export function withCrispen(config: NextConfig = {}, options: CrispenNextOptions = {}): NextConfig {
  const endpoint = options.endpoint ?? prefixBasePath(config.basePath, DEFAULT_ENDPOINT)
  const deployment: Deployment = {
    builtAt: new Date(),
    id: resolveDeploymentId(options.deploymentId ?? config.deploymentId),
  }
  const embed: CrispenEmbed = {
    endpoint,
    running: {
      builtAt: deployment.builtAt?.toISOString(),
      id: deployment.id,
    },
    v: 1,
  }
  const descriptorHeader = createDescriptorHeader(endpoint)
  const development = isNextDevelopmentCommand()

  return {
    ...config,
    env: {
      ...config.env,
      [DESCRIPTOR_ENVIRONMENT_KEY]: development ? "" : serializeDescriptor(deployment),
      [EMBED_ENVIRONMENT_KEY]: development ? "" : JSON.stringify(embed),
    },
    headers:
      descriptorHeader === undefined
        ? config.headers
        : async () => [
            ...(config.headers === undefined ? [] : await config.headers()),
            descriptorHeader,
          ],
  }
}

function prefixBasePath(basePath: string | undefined, endpoint: string): string {
  if (basePath === undefined || basePath.length === 0) {
    return endpoint
  }

  return `${basePath.replace(/\/+$/u, "")}${endpoint}`
}

function isNextDevelopmentCommand(): boolean {
  return process.argv.some((argument) => argument === "dev" || argument === "next-dev")
}

function createDescriptorHeader(
  endpoint: string
): Awaited<ReturnType<NonNullable<NextConfig["headers"]>>>[number] | undefined {
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//iu.test(endpoint)) {
    return undefined
  }

  return {
    headers: [{ key: "Cache-Control", value: "no-store" }],
    source: endpoint,
  }
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

function escapeScriptText(value: string): string {
  return value
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
}
