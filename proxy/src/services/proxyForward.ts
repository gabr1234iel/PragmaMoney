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
  "accept-encoding", // Don't forward — node-fetch v2 can't decompress br/zstd
]);

/** PragmaMoney-internal headers that should not leak to upstream services. */
const INTERNAL_HEADERS = new Set([
  "x-payment",
  "x-payment-id",
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

    // Filter hop-by-hop and internal headers from the incoming request.
    const forwardHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lk = key.toLowerCase();
      if (HOP_BY_HOP_HEADERS.has(lk) || INTERNAL_HEADERS.has(lk)) continue;
      if (value === undefined) continue;
      forwardHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
    }

    // Inject API key for wrapped upstream services
    if (resource.apiKey) {
      const header = resource.apiKeyHeader ?? "Authorization";
      forwardHeaders[header.toLowerCase()] = resource.apiKey;
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

    // Collect response headers, stripping hop-by-hop and content-encoding/length
    // (we re-serialize the body, so these won't match the original).
    const SKIP_RESPONSE_HEADERS = new Set([
      ...HOP_BY_HOP_HEADERS,
      "content-encoding",
      "content-length",
    ]);
    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
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
