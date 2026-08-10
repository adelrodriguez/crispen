import assert from "node:assert/strict"
import {
  DEFAULT_DESCRIPTOR_ENDPOINT,
  TargetResolutionError,
  createDeploymentMonitor,
  createEmbeddedSource,
  createHttpSource,
  createStaticSource,
  getDefaultMonitor,
  getMonitor,
  parseDescriptor,
  readEmbed,
  serializeDescriptor,
} from "crispen"
import { CrispenScript, GET, crispenPagesHandler, withCrispen } from "crispen/next"
import { useDeploymentStatus } from "crispen/react"
import { crispen } from "crispen/vite"

const runtimeExports = {
  CrispenScript,
  GET,
  TargetResolutionError,
  createDeploymentMonitor,
  createEmbeddedSource,
  createHttpSource,
  createStaticSource,
  crispen,
  crispenPagesHandler,
  getDefaultMonitor,
  getMonitor,
  parseDescriptor,
  readEmbed,
  serializeDescriptor,
  useDeploymentStatus,
  withCrispen,
}

for (const [name, exportedValue] of Object.entries(runtimeExports)) {
  assert.equal(typeof exportedValue, "function", `${name} must be a function export`)
}

assert.equal(typeof DEFAULT_DESCRIPTOR_ENDPOINT, "string")
