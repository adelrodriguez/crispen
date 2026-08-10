import type { DeploymentPolicy } from "../protocol"

export function exactMatch(): DeploymentPolicy {
  return (running, target) => (running.id === target.id ? "current" : "stale")
}
