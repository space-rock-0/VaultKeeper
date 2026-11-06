import type { NextFunction, Request, Response } from "express";
import { allowedFrontendOrigins } from "../config/security";

export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");

  if (fetchSite === "cross-site" || (origin && !allowedFrontendOrigins.includes(origin))) {
    res.status(403).json({ message: "Request origin is not allowed." });
    return;
  }
  next();
}
