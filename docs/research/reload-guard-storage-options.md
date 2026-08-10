# Reload guard storage options

## Question

Crispen stores the `crispen:reload` marker in `sessionStorage`. The marker is part of one tab's reload sequence. Storage can be unavailable, and the reload guard then becomes inactive without an error.

This note compares first-party library APIs that select browser persistence storage or accept a custom storage adapter.

## First-party examples

| Library         | Public API                                                                                                                                                                                                                            | Default and semantics                                                                                                                                                                                                                                                                                                                            | Useful lesson for Crispen                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MSAL Browser    | `cache.cacheLocation?: BrowserCacheLocation                                                                                                                                                                                           | string`. Valid values are `"sessionStorage"`, `"localStorage"`, and `"memoryStorage"`.                                                                                                                                                                                                                                                           | `"sessionStorage"` is the default. Microsoft states that session storage is not shared between tabs, local storage is shared between tabs, and memory storage does not survive a reload. MSAL falls back to memory for temporary entries if session storage is not available.                                                                                                                                | Full Web Storage names make the browser behavior clear. The official table makes the tab scope difference explicit. [Caching guide](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching), [configuration source](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/src/config/Configuration.ts)                                                                                                 |
| Auth0 SPA SDK   | `cacheLocation?: "memory"                                                                                                                                                                                                             | "localstorage"`and`cache?: ICache`. A custom cache takes precedence over `cacheLocation`.                                                                                                                                                                                                                                                        | The default is `"memory"`. Auth0 does not offer session storage for the token cache. A separate transaction option uses session storage by default and says that cookies can help flows that span tabs or cannot use session storage.                                                                                                                                                                        | A short string union is good for built-ins. A separate custom-adapter option gives a clear precedence rule, but two related options add API surface. [API reference](https://auth0.github.io/auth0-spa-js/interfaces/Auth0ClientOptions.html), [type source](https://github.com/auth0/auth0-spa-js/blob/main/src/global.ts)                                                                                                                                    |
| oidc-client-ts  | `userStore?: StateStore`; the documented example is `new WebStorageStateStore({ store: window.localStorage })`. `WebStorageStateStore` accepts `store?: Storage                                                                       | AsyncStorage`and`prefix?: string`.                                                                                                                                                                                                                                                                                                               | `userStore` defaults to `window.sessionStorage`; it uses in-memory storage when there is no `window`. `WebStorageStateStore` itself defaults to `localStorage` and prefixes keys with `"oidc."`. Its methods are asynchronous at the `StateStore` boundary.                                                                                                                                                  | A storage object gives maximum control. A wrapper can add namespacing and normalize sync or async storage. The default can still match the data lifetime. [UserManager settings](https://authts.github.io/oidc-client-ts/interfaces/UserManagerSettings.html), [WebStorageStateStore API](https://authts.github.io/oidc-client-ts/classes/WebStorageStateStore.html), [source](https://github.com/authts/oidc-client-ts/blob/main/src/WebStorageStateStore.ts) |
| redux-persist   | `persistConfig.storage` is a required storage engine. The package exports separate local-storage and session-storage engines. A custom engine implements `setItem`, `getItem`, and `removeItem`; these methods must support promises. | The web quick start imports the local-storage engine. Selection occurs through an adapter object, not a string union.                                                                                                                                                                                                                            | Adapter injection is simple and extensible. Separate imports avoid browser-global lookup in the core option parser. [Official repository README](https://github.com/rt2zz/redux-persist/blob/master/README.md#storage-engines)                                                                                                                                                                               |
| Zustand persist | `storage?: PersistStorage`; `createJSONStorage(() => window.sessionStorage)` or `createJSONStorage(() => window.localStorage)` adapts Web Storage. `StateStorage` has `getItem`, `setItem`, and `removeItem`.                         | The default is `createJSONStorage(() => window.localStorage)`. The factory catches an error from the storage getter and returns `undefined`, for example during SSR. The middleware then continues without persistence. Operation errors go to its hydration error path; the getter catch does not cover later `setItem` or `removeItem` errors. | A lazy getter prevents eager `window` access during SSR. Storage access and each operation still need defensive handling. The structural interface closely matches `RuntimeStorage`. [official persistence guide source](https://github.com/pmndrs/zustand/blob/main/docs/integrations/persisting-store-data.md), [middleware source](https://github.com/pmndrs/zustand/blob/main/src/middleware/persist.ts) |
| TanStack Query  | `createSyncStoragePersister({ storage })`, where `storage` is `Storage                                                                                                                                                                | undefined                                                                                                                                                                                                                                                                                                                                        | null`. Official examples pass `window.localStorage`or`window.sessionStorage`.                                                                                                                                                                                                                                                                                                                                | There is no implicit browser-storage default. `undefined` and `null` are valid, which lets an SSR caller disable persistence. Write failures can use a retry function; no retry occurs by default. The sync persister is now deprecated in favor of the async-storage persister.                                                                                                                                                                               | An explicit nullable adapter makes SSR behavior clear. The API does not need a string union when the caller selects the browser object. [official API guide](https://tanstack.com/query/latest/docs/framework/react/plugins/createSyncStoragePersister) |

## Assessment for Crispen

### Storage scope

The reload guard records one reload sequence. The current `crispen:reload` key is per tab because `sessionStorage` is per tab and survives reloads in that tab. This scope matches the reload guard.

`localStorage` is shared between same-origin tabs. With the current single key, one tab can read, replace, clear, or increment another tab's marker. One tab can then block a valid reload in another tab. Local storage also keeps a failed sequence after the tab closes. These semantics do not match a per-tab reload sequence.

A local-storage mode would need a stable tab identifier in the key. That identifier needs per-tab persistence, which normally requires session storage. Thus local storage does not give a useful fallback when session storage is unavailable.

### Naming

- `"session" | "local"` is concise, but it hides the direct relation to the browser APIs.
- `"sessionStorage" | "localStorage"` follows MSAL and the browser names. It also makes the cross-tab behavior easier to identify.
- A `RuntimeStorage` object supports tests, browser wrappers, and nonstandard environments. It does not require the full DOM `Storage` API.
- A direct expression such as `storage: window.sessionStorage` can fail in SSR code before Crispen can handle it. A string choice lets Crispen resolve the browser global lazily and safely.

### Access errors

A browser can throw when code reads `window.sessionStorage`. A storage operation can also throw because of access policy, privacy mode, or quota. Crispen must catch both classes of error. It must report `reloadStatus: "unprotected"` after an access error, and `reload()` must continue without guard protection.

## Proposal

Use one option with a discriminated value:

```ts
export type ReloadGuardStorage = "sessionStorage" | "localStorage" | RuntimeStorage

export interface DeploymentMonitorOptions {
  reloadGuardStorage?: ReloadGuardStorage
}
```

Apply these rules:

1. Default to `"sessionStorage"`. This preserves current behavior and the correct per-tab scope.
2. Resolve string values only in the browser environment. Do not read `window` or a storage getter during module initialization.
3. Catch errors when Crispen gets the browser storage object and when it calls `getItem`, `setItem`, or `removeItem`.
4. If access fails, use no reload guard storage. Do not throw and do not change reload behavior.
5. Accept `RuntimeStorage`, not the full DOM `Storage` type. The current three-method interface is sufficient and supports lightweight custom adapters.
6. Document `"localStorage"` as an expert option with cross-tab behavior. Do not recommend it for the current `crispen:reload` marker. Before implementation, either reject this built-in or add a true per-tab key strategy. The safer initial public API is `"sessionStorage" | RuntimeStorage`.

## Recommendation

For the first release, expose:

```ts
reloadGuardStorage?: "sessionStorage" | RuntimeStorage
```

Keep `"sessionStorage"` as the default. Do not add `"localStorage"` until Crispen has a use case whose state is intentionally shared between tabs. This design gives users a custom adapter without making an unsafe cross-tab mode appear to be a normal choice.
