import type { Request } from "express";
import fetch, { type Response as FetchResponse } from "node-fetch";
import type { Resource } from "../types/x402.js";

/**
 * Generic HTTP relay that forwards incoming requests to the resource's
 * original URL and returns the upstream response.
 */

/** Headers that must NOT be forwarded between hops. */
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);

export interface ForwardResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Forward `req` to the upstream service described by `resource`.
 *
 * Any trailing path segments after `/proxy/:resourceId` are appended to
 * the resource's `originalUrl`.
 */
export async function forwardRequest(
  resource: Resource,
  req: Request
): Promise<ForwardResult> {
  try {
    // Build the target URL.
    // req.params is like { resourceId: "echo-service", "0": "/extra/path" }
    const trailingPath: string =
      (req.params as Record<string, string>)["0"] ?? "";
    const targetUrl = resource.originalUrl + trailingPath;

    // Filter hop-by-hop headers from the incoming request.
    const forwardHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
      if (value === undefined) continue;
      forwardHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
    }

    // Determine request body -- only send for methods that support it.
    const hasBody = !["GET", "HEAD", "OPTIONS"].includes(
      req.method.toUpperCase()
    );
    const body = hasBody && req.body ? JSON.stringify(req.body) : undefined;

    if (hasBody && body) {
      forwardHeaders["content-type"] = "application/json";
    }

    const upstream: FetchResponse = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
      timeout: 30_000, // 30 s upstream timeout
    });

    // Collect response headers, stripping hop-by-hop.
    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    // Try to parse as JSON; fall back to raw text.
    let responseBody: unknown;
    const contentType = upstream.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      responseBody = await upstream.json();
    } else {
      responseBody = await upstream.text();
    }

    return {
      status: upstream.status,
      headers: responseHeaders,
      body: responseBody,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Upstream request failed";
    console.error(`[proxyForward] error: ${message}`);
    return {
      status: 502,
      headers: {},
      body: { error: "Bad Gateway", detail: message },
    };
  }
}
