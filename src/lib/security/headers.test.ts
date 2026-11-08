import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config";

describe("Security Headers Configuration (Task 14)", () => {
  it("exports comprehensive security headers for all routes (/:path*)", async () => {
    expect(nextConfig.headers).toBeDefined();
    const headersRules = await nextConfig.headers!();
    expect(headersRules).toHaveLength(1);
    expect(headersRules[0].source).toBe("/:path*");

    const headers = headersRules[0].headers;
    const headerMap = new Map(headers.map((h: { key: string; value: string }) => [h.key, h.value]));

    // 1. Strict Transport Security (HSTS)
    expect(headerMap.get("Strict-Transport-Security")).toMatch(/max-age=\d+;\s*includeSubDomains;\s*preload/);

    // 2. Clickjacking protection: X-Frame-Options DENY
    expect(headerMap.get("X-Frame-Options")).toBe("DENY");

    // 3. MIME type sniffing protection: nosniff
    expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");

    // 4. Referrer Policy
    expect(headerMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");

    // 5. Permissions Policy
    const permPolicy = headerMap.get("Permissions-Policy");
    expect(permPolicy).toContain("camera=()");
    expect(permPolicy).toContain("microphone=()");
    expect(permPolicy).toContain("geolocation=()");

    // 6. Content Security Policy (CSP)
    const csp = headerMap.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");

    // Verify 'unsafe-eval' is strictly eliminated from script-src
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });
});
