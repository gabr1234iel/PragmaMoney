import express, { type Request, type Response } from "express";
import cors from "cors";

import { config } from "./config.js";
import { createX402Gate } from "./middleware/x402Gate.js";
import { adminAuth } from "./middleware/adminAuth.js";
import {
  getAllResources,
  registerResource,
  getResource,
} from "./services/resourceStore.js";
import { forwardRequest } from "./services/proxyForward.js";
import type { ServiceType } from "./types/x402.js";
import { registerAgentRouter } from "./routes/registerAgent.js";
import { fundAgentRouter } from "./routes/fundAgent.js";

// ---------------------------------------------------------------------------
// Express App
// ---------------------------------------------------------------------------

const app = express();

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------

app.use(
  cors({
    origin: config.allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-payment",
      "x-payment-id",
      "PAYMENT-SIGNATURE",
      "Access-Control-Expose-Headers",
    ],
    exposedHeaders: [
      "X-PAYMENT-RESPONSE",
      "PAYMENT-REQUIRED",
      "PAYMENT-RESPONSE",
    ],
  })
);

app.use(express.json());

// Simple request logger
app.use((req: Request, _res: Response, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ---------------------------------------------------------------------------
// Free Routes
// ---------------------------------------------------------------------------

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/services", (_req: Request, res: Response) => {
  res.json(getAllResources());
});

// ---------------------------------------------------------------------------
// Admin Routes
// ---------------------------------------------------------------------------

interface RegisterBody {
  id?: string;
  name?: string;
  type?: ServiceType;
  creatorAddress?: string;
  originalUrl?: string;
  pricing?: { pricePerCall?: string; currency?: "USDC" };
  apiKey?: string;
  apiKeyHeader?: string;
}

app.post("/admin/register", adminAuth(), (req: Request, res: Response) => {
  const body = req.body as RegisterBody;

  if (
    !body.name ||
    !body.type ||
    !body.creatorAddress ||
    !body.originalUrl ||
    !body.pricing?.pricePerCall
  ) {
    res.status(400).json({
      error: "Missing required fields: name, type, creatorAddress, originalUrl, pricing.pricePerCall",
    });
    return;
  }

  // Generate an id from the name if not provided
  const id =
    body.id ??
    body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const resource = registerResource({
    id,
    name: body.name,
    type: body.type,
    creatorAddress: body.creatorAddress,
    originalUrl: body.originalUrl,
    pricing: {
      pricePerCall: body.pricing.pricePerCall,
      currency: "USDC",
    },
    apiKey: body.apiKey,
    apiKeyHeader: body.apiKeyHeader,
  });

  res.status(201).json(resource);
});

// Agent registration relayer (agent-owned NFTs, 2-phase: fund + setup)
app.use("/register-agent", registerAgentRouter);

// Standalone ETH faucet for already-registered agents
app.use("/fund-agent", fundAgentRouter);

// ---------------------------------------------------------------------------
// Proxy Routes (payment-gated)
// ---------------------------------------------------------------------------

const x402Gate = createX402Gate();

/**
 * Proxy handler shared by both route patterns.
 */
async function proxyHandler(req: Request, res: Response): Promise<void> {
  const resourceId = (req.params as Record<string, string>).resourceId;
  const resource = getResource(resourceId);

  if (!resource) {
    // Should not happen (gate already checked), but be safe
    res.status(404).json({ error: `Resource '${resourceId}' not found` });
    return;
  }

  const result = await forwardRequest(resource, req);

  // Forward upstream headers
  for (const [key, value] of Object.entries(result.headers)) {
    res.setHeader(key, value);
  }

  res.status(result.status).json(result.body);
}

// With trailing path: /proxy/:resourceId/extra/path...
app.all("/proxy/:resourceId/*", x402Gate, (req: Request, res: Response) => {
  proxyHandler(req, res).catch((err) => {
    console.error("[proxy] handler error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal proxy error" });
  });
});

// Without trailing path: /proxy/:resourceId
app.all("/proxy/:resourceId", x402Gate, (req: Request, res: Response) => {
  proxyHandler(req, res).catch((err) => {
    console.error("[proxy] handler error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal proxy error" });
  });
});

// ---------------------------------------------------------------------------

export { app };
