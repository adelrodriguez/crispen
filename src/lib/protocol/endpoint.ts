export function isExternalEndpoint(endpoint: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:)?\/\//iu.test(endpoint)
}

export function resolvePublicEndpoint(base: string, endpoint: string): string {
  if (isExternalEndpoint(endpoint)) {
    return endpoint
  }

  const rootedEndpoint = `/${endpoint.replace(/^\/+/, "")}`
  if (!base.startsWith("/") || base === "/") {
    return rootedEndpoint
  }

  return `${base.replace(/\/+$/u, "")}${rootedEndpoint}`
}
