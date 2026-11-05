# ADR-006: Login Throttling, Timing-Attack Defense, and Open-Redirect Prevention

## Status
Accepted

## Context
Industrial quoting applications contain sensitive pricing formulas, customer margin data, and OEM design contracts. They are targets for credential stuffing, brute-force dictionary attacks, user enumeration via timing attacks, and phishing via open redirects.

## Decision
1. **Login Throttling:**
   - Failed login attempts are recorded in the `login_attempts` table.
   - Any combination of (normalized email, client IP) with 5 or more failed attempts within a rolling 15-minute window is immediately locked out.
   - Client IP extraction protects against header spoofing by inspecting direct platform headers (`x-real-ip`, `cf-connecting-ip`) or the rightmost hop in `x-forwarded-for` (the reverse proxy hop under our infrastructure control), rather than trust-on-first-hop.
   - Throttling lockouts emit a typed `LockedAccountError` (subclass of Auth.js `CredentialsSignin`) passing `code: "locked"` directly to the client UI.

2. **Timing-Attack Defense:**
   - To prevent attackers from discovering valid email addresses through response latency differences between existing and non-existing accounts, non-existent email requests trigger a constant-time `bcrypt.compare` against a pre-computed valid 60-character bcrypt hash (`DUMMY_HASH`).
   - The hash is generated during module initialization with legitimate work-factor 10, ensuring constant runtime and avoiding early bailout by the bcrypt parser.

3. **Open-Redirect Hardening:**
   - Post-login redirection parameter `callbackUrl` is strictly validated on the client and server.
   - Redirect targets must start with a single `/`, cannot start with `//` or `/\` (protocol-relative and Windows path bypasses), and must only contain alphanumeric characters, underscores, hyphens, and slashes (`/^[a-zA-Z0-9_\-\/]+$/`).
   - Any unrecognized format falls back to `/rfqs`.

## Consequences
### Positive
- Defense-in-depth against automated credential stuffing, timing probes, and phishing vectors.
- Fully transparent user experience: legitimate users receive informative lockout alerts, while attackers gain zero timing or enumeration signal.

### Negative / Trade-offs
- Multiple users behind a single corporate NAT proxy sharing an IP could potentially encounter lockout if an attacker repeatedly targets accounts from the same public egress IP. Throttling evaluates both email and IP independently to minimize legitimate collateral impact.
