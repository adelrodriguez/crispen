// eslint-disable-next-line import/named -- The runtime bridge targets built package output.
import { withCrispen } from "crispen/next"

export default withCrispen(
  { output: "export" },
  { deploymentId: process.env.CRISPEN_DEPLOYMENT_ID }
)
