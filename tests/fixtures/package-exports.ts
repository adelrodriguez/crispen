import { createDeploymentMonitor } from "crispen"
import { CrispenScript, withCrispen } from "crispen/next"
import { useDeploymentStatus } from "crispen/react"
import { crispen } from "crispen/vite"

export const packageExports = {
  CrispenScript,
  createDeploymentMonitor,
  crispen,
  useDeploymentStatus,
  withCrispen,
}
