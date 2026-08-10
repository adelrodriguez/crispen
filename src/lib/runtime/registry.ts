import type { DeploymentSource } from "../protocol"
import type { DeploymentMonitor } from "./monitor"
import { createEmbeddedSource } from "../protocol"
import { createDeploymentMonitor } from "./monitor"

let defaultMonitor: DeploymentMonitor | undefined
const monitors = new Map<DeploymentSource, DeploymentMonitor>()

export function getDefaultMonitor(): DeploymentMonitor {
  defaultMonitor ??= createDeploymentMonitor(createEmbeddedSource())
  return defaultMonitor
}

export function getMonitor(source: DeploymentSource): DeploymentMonitor {
  const existing = monitors.get(source)
  if (existing !== undefined) {
    return existing
  }

  const monitor = createDeploymentMonitor(source)
  monitors.set(source, monitor)
  return monitor
}

export function resetRegistry(): void {
  defaultMonitor?.destroy()
  defaultMonitor = undefined

  for (const monitor of monitors.values()) {
    monitor.destroy()
  }
  monitors.clear()
}
