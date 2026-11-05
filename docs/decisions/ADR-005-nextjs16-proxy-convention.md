# ADR-005: Next.js 16 Route Interception via Proxy Convention

## Status
Accepted

## Context
Next.js 16 (Canary / latest release line) updated its edge request routing layer. The historic `src/middleware.ts` convention has been succeeded by `src/proxy.ts` exporting an explicit `proxy(request: NextRequest)` function.
When running with Next.js 16 and Turbopack (`next dev --turbopack` or `next build`), legacy middleware naming causes routing deprecation warnings or unexpected interception behavior.

## Decision
1. We use `src/proxy.ts` adhering to the Next.js 16 specification.
2. The proxy inspects incoming requests and redirects unauthenticated users to `/login`, preserving the requested URL in `callbackUrl`.
3. Safe public paths (`/login`, `/api/auth`, `/api/health`, and static assets `/_next/`, `favicon.ico`) bypass authentication interception.
4. Client-side authentication checks and server action role enforcement (`requireUser()`, `requireRole()`) continue to operate as defense-in-depth behind the proxy.

## Consequences
### Positive
- Native compatibility with Next.js 16 and Turbopack compilers.
- Clean separation between edge routing redirection and in-depth database-backed session validation.

### Negative / Trade-offs
- Developers familiar only with older Next.js 13/14 middleware conventions must be guided to `src/proxy.ts`.
