import {
  createDeploymentMonitor,
  createStaticSource,
  parseDescriptor,
  type Deployment,
  type DeploymentMonitor,
  type RuntimeEnvironment,
} from "crispen"
import {
  CrispenScript,
  GET,
  crispenPagesHandler,
  withCrispen,
  type CrispenNextOptions,
  type NextConfigExport,
} from "crispen/next"
import {
  useDeploymentStatus,
  type DeploymentStatus,
  type DeploymentStatusOptions,
} from "crispen/react"
import { crispen, type CrispenViteOptions } from "crispen/vite"

const deployment: Deployment = parseDescriptor('{"v":1,"id":"package-contract"}')
const monitor: DeploymentMonitor = createDeploymentMonitor(
  createStaticSource(deployment, deployment)
)
const vitePlugin = crispen({ deploymentId: deployment.id } satisfies CrispenViteOptions)
const nextConfig: NextConfigExport = withCrispen({}, {
  deploymentId: deployment.id,
} satisfies CrispenNextOptions)
const hookOptions = {} satisfies DeploymentStatusOptions
const declarationContract = {
  appRoute: GET,
  environment: undefined as unknown as RuntimeEnvironment,
  hookOptions,
  hookStatus: undefined as unknown as DeploymentStatus,
  monitor,
  nextConfig,
  pagesRoute: crispenPagesHandler,
  scriptComponent: CrispenScript,
  statusHook: useDeploymentStatus,
  vitePlugin,
}

void declarationContract
