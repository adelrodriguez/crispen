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

  if (!isEmbed(embed)) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console -- Invalid build-time data must be visible in development.
      console.warn("Crispen ignored a malformed deployment embed.")
    }

    return undefined
  }

  return embed
}

function isEmbed(value: unknown): value is CrispenEmbed {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  const running = candidate.running

  return (
    candidate.v === 1 &&
    typeof running === "object" &&
    running !== null &&
    typeof (running as Record<string, unknown>).id === "string" &&
    ((running as Record<string, unknown>).id as string).length > 0 &&
    ((running as Record<string, unknown>).builtAt === undefined ||
      typeof (running as Record<string, unknown>).builtAt === "string") &&
    (candidate.endpoint === undefined || typeof candidate.endpoint === "string")
  )
}
