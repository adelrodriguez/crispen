import type { Plugin } from "vite"
import type { CrispenEmbed } from "../../lib/protocol/embed"
import type { Deployment } from "../../lib/protocol/types"
import { serializeDescriptor } from "../../lib/protocol/descriptor"
import {
  DEFAULT_DESCRIPTOR_ENDPOINT,
  checkIsExternalEndpoint,
  resolveDeploymentId,
  resolvePublicEndpoint,
  serializeEmbed,
} from "../shared"

export interface CrispenViteOptions {
  readonly deploymentId?: string
  readonly endpoint?: string
}

export function crispen(options: CrispenViteOptions = {}): Plugin {
  const descriptorEndpoint = options.endpoint ?? DEFAULT_DESCRIPTOR_ENDPOINT
  let endpoint = descriptorEndpoint
  let deployment: Deployment | undefined

  return {
    apply: "build",
    configResolved(config) {
      endpoint = resolvePublicEndpoint(config.base, descriptorEndpoint)
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
  if (checkIsExternalEndpoint(endpoint)) {
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
