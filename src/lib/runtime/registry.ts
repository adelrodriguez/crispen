import type { DeploymentSource } from "../protocol"
import type { DeploymentMonitor } from "./monitor"
import { createEmbeddedSource } from "../protocol"
import { createDeploymentMonitor } from "./monitor"

let defaultMonitor: DeploymentMonitor | undefined
let monitors = new WeakMap<DeploymentSource, DeploymentMonitor>()
const monitorReferences = new Set<WeakRef<DeploymentMonitor>>()
const monitorFinalizer = new FinalizationRegistry<WeakRef<DeploymentMonitor>>((reference) => {
  monitorReferences.delete(reference)
})

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
  const reference = new WeakRef(monitor)
  monitorReferences.add(reference)
  monitorFinalizer.register(monitor, reference, reference)
  return monitor
}

export function resetRegistry(): void {
  defaultMonitor?.destroy()
  defaultMonitor = undefined

  for (const reference of monitorReferences) {
    reference.deref()?.destroy()
    monitorFinalizer.unregister(reference)
  }
  monitorReferences.clear()
  monitors = new WeakMap()
}
