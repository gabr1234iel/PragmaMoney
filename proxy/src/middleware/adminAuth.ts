import type { Request, Response, NextFunction, RequestHandler } from "express";
import { config } from "../config.js";

/**
 * Middleware that protects admin routes with a Bearer token.
 * Checks the `Authorization: Bearer <token>` header against `config.adminToken`.
 */
export function adminAuth(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.adminToken) {
      res.status(500).json({ error: "Admin token not configured on server" });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or malformed Authorization header" });
      return;
    }

    const token = authHeader.slice(7);
    if (token !== config.adminToken) {
      res.status(401).json({ error: "Invalid admin token" });
      return;
    }

    next();
  };
}
