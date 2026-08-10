import type { Deployment, DeploymentSource } from "./types"
import { parseDescriptor } from "./descriptor"
import { readEmbed } from "./embed"

export type TargetResolutionErrorReason = "network" | "http-status" | "not-json"

export class TargetResolutionError extends Error {
  override readonly name = "TargetResolutionError"
  readonly reason: TargetResolutionErrorReason

  constructor(reason: TargetResolutionErrorReason) {
    super(`Could not resolve target deployment: ${reason}`)
    this.reason = reason
  }
}

export const DEFAULT_DESCRIPTOR_ENDPOINT = "/_crispen/deployment.json"

export function createEmbeddedSource(): DeploymentSource | undefined {
  const embed = readEmbed()

  if (embed === undefined) {
    return undefined
  }

  return createHttpSource(
    {
      id: embed.running.id,
      ...(embed.running.builtAt === undefined ? {} : { builtAt: new Date(embed.running.builtAt) }),
    },
    embed.endpoint ?? DEFAULT_DESCRIPTOR_ENDPOINT
  )
}

export function createHttpSource(running: Deployment, endpoint: string): DeploymentSource {
  return {
    async resolveTarget(signal) {
      let response: Response

      try {
        response = await fetch(endpoint, { cache: "no-store", signal })
      } catch (error) {
        if ((error instanceof DOMException && error.name === "AbortError") || signal.aborted) {
          throw error
        }

        throw new TargetResolutionError("network")
      }

      if (!response.ok) {
        throw new TargetResolutionError("http-status")
      }

      if (!response.headers.get("content-type")?.toLowerCase().includes("json")) {
        throw new TargetResolutionError("not-json")
      }

      return parseDescriptor(await response.text())
    },
    running,
  }
}
