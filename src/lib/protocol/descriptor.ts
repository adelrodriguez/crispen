import type { Deployment } from "./types"
import { TargetResolutionError } from "./errors"

export interface DescriptorV1 {
  readonly v: 1
  readonly id: string
  readonly builtAt?: string
}

interface DescriptorCandidate {
  readonly builtAt?: unknown
  readonly id?: unknown
  readonly v?: unknown
}

export function serializeDescriptor(deployment: Deployment): string {
  const descriptor: DescriptorV1 = {
    id: deployment.id,
    v: 1,
    ...(deployment.builtAt === undefined ? {} : { builtAt: deployment.builtAt.toISOString() }),
  }

  return JSON.stringify(descriptor, ["v", "id", "builtAt"])
}

export function parseDescriptor(text: string): Deployment {
  let descriptor: DescriptorCandidate

  try {
    descriptor = JSON.parse(text) as DescriptorCandidate
  } catch {
    throw new TargetResolutionError("invalid-json", text)
  }

  if (typeof descriptor.v !== "number" || !Number.isInteger(descriptor.v) || descriptor.v < 1) {
    throw new TargetResolutionError("unsupported-version", text)
  }

  if (typeof descriptor.id !== "string" || descriptor.id.length === 0) {
    throw new TargetResolutionError("invalid-shape", text)
  }

  const builtAt = typeof descriptor.builtAt === "string" ? new Date(descriptor.builtAt) : undefined

  return {
    id: descriptor.id,
    ...(builtAt === undefined || Number.isNaN(builtAt.getTime()) ? {} : { builtAt }),
  }
}
