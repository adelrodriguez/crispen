import type { Deployment } from "../protocol"
import type { RuntimeEnvironment } from "./environment"

export const RELOAD_MARKER_KEY = "crispen:reload"
export const RELOAD_COOLDOWN = 10 * 60_000

interface ReloadMarker {
  readonly at: number
  readonly attempts: number
  readonly from: string
  readonly to: string
}

export function clearSuccessfulReload(running: Deployment, environment: RuntimeEnvironment): void {
  const marker = readMarker(environment)

  if (marker !== undefined && marker.from !== running.id) {
    try {
      environment.storage?.removeItem(RELOAD_MARKER_KEY)
    } catch {
      // Storage is optional protection. A storage failure must not break startup.
    }
  }
}

export function requestReload(
  running: Deployment,
  target: Deployment | null,
  environment: RuntimeEnvironment
): boolean {
  if (target === null || environment.storage === null) {
    environment.reload()
    return false
  }

  try {
    const previous = readMarker(environment)
    const repeated =
      previous !== undefined &&
      previous.from === running.id &&
      previous.to === target.id &&
      environment.now() - previous.at < RELOAD_COOLDOWN
    const attempts = repeated ? previous.attempts + 1 : 0
    const marker: ReloadMarker = {
      at: environment.now(),
      attempts,
      from: running.id,
      to: target.id,
    }

    environment.storage.setItem(RELOAD_MARKER_KEY, JSON.stringify(marker))

    if (attempts >= 2) {
      return true
    }
  } catch {
    // Storage is optional protection. Reload remains available when it fails.
  }

  environment.reload()
  return false
}

function readMarker(environment: RuntimeEnvironment): ReloadMarker | undefined {
  try {
    const value = environment.storage?.getItem(RELOAD_MARKER_KEY)
    if (value === null || value === undefined) {
      return undefined
    }

    const marker = JSON.parse(value) as Partial<ReloadMarker>
    if (
      typeof marker.at !== "number" ||
      typeof marker.attempts !== "number" ||
      typeof marker.from !== "string" ||
      typeof marker.to !== "string"
    ) {
      return undefined
    }

    return marker as ReloadMarker
  } catch {
    return undefined
  }
}
