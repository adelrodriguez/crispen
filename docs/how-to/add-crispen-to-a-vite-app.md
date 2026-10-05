# How to add Crispen to a Vite app

This guide adds an update notice to a Vite and React app. The notice appears when a newer deployment is live.

1. Install the package:

   ```sh
   bun add crispen
   ```

2. Add the adapter to `vite.config.ts`, after the React plugin:

   ```ts
   import react from "@vitejs/plugin-react"
   import { crispen } from "crispen/vite"
   import { defineConfig } from "vite"

   export default defineConfig({
     plugins: [react(), crispen()],
   })
   ```

3. Add a component that reads the status:

   ```tsx
   import { useDeploymentStatus } from "crispen/react"

   export function UpdateNotice() {
     const deployment = useDeploymentStatus()

     if (deployment.status !== "stale") {
       return null
     }

     return (
       <aside>
         <p>A new version is available.</p>
         <button type="button" onClick={deployment.reload}>
           Reload
         </button>
       </aside>
     )
   }
   ```

4. Render `<UpdateNotice />` once, near the root of the app.

5. Run `vite build`. Make sure that the output contains `_crispen/deployment.json`.

6. Configure your host to serve the descriptor without a cache. See [How to stop hosts from caching the descriptor](./stop-hosts-from-caching-the-descriptor.md).

The adapter detects the deployment ID on Vercel, Cloudflare Pages, Netlify, and GitHub Actions. On another host, see [How to set the deployment ID](./set-the-deployment-id.md).

## If your app uses a base path

The adapter adds Vite `base` to the descriptor URL. You do not need to change anything.

## If the descriptor lives on another origin

Set `endpoint` to the full URL. The adapter then writes no descriptor file, and your service must serve the [descriptor format](../reference/descriptor.md).

```ts
crispen({ endpoint: "https://deployments.example.com/current.json" })
```

## If `reload()` stops working

If two reloads within 10 minutes land on the same old deployment, the reload guard blocks the third, and `reloadStatus` becomes `"blocked"`. Show a message for that state:

```tsx
if (deployment.reloadStatus === "blocked") {
  return <p>The update is not ready yet. Try again in a few minutes.</p>
}
```

[The reload guard stops reload loops](../explanation/how-crispen-detects-a-stale-client.md#the-reload-guard-stops-reload-loops) explains why.
