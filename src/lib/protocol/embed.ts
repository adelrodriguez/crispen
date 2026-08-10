export interface CrispenEmbed {
  readonly v: 1
  readonly running: {
    readonly id: string
    readonly builtAt?: string
  }
  readonly endpoint?: string
}

declare global {
  var __CRISPEN__: CrispenEmbed | undefined
}

export function readEmbed(): CrispenEmbed | undefined {
  const embed: unknown = globalThis.__CRISPEN__

  if (embed === undefined) {
    return undefined
  }

  if (!checkIsEmbed(embed)) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console -- Invalid build-time data must be visible in development.
      console.warn("Crispen ignored a malformed deployment embed.")
    }

    return undefined
  }

  return embed
}

function checkIsEmbed(value: unknown): value is CrispenEmbed {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const { v, running, endpoint } = value as Record<string, unknown>

  if (v !== 1 || (endpoint !== undefined && typeof endpoint !== "string")) {
    return false
  }

  if (typeof running !== "object" || running === null) {
    return false
  }

  const { id, builtAt } = running as Record<string, unknown>

  return (
    typeof id === "string" &&
    id.length > 0 &&
    (builtAt === undefined || typeof builtAt === "string")
  )
}
