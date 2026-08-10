import { createDeploymentMonitor } from "crispen"
import { CrispenScript, withCrispen } from "crispen/next"
import { deploymentStatusOptions, useDeploymentStatus } from "crispen/react"
import { crispen } from "crispen/vite"

export const packageExports = {
  CrispenScript,
  createDeploymentMonitor,
  crispen,
  deploymentStatusOptions,
  useDeploymentStatus,
  withCrispen,
}
