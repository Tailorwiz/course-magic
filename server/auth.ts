import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in .env");
}
const SECRET: string = JWT_SECRET;

const TOKEN_TTL = "30d"; // long-lived; revoke by rotating JWT_SECRET

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

// Extract Bearer token from Authorization header
function getBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}

// Extract token from header OR ?token= query param.
// Use this for endpoints called by <audio>/<img>/<video> tags that can't set headers.
function getTokenFromAnywhere(req: Request): string | null {
  const fromHeader = getBearer(req);
  if (fromHeader) return fromHeader;
  const q = req.query.token;
  if (typeof q === "string" && q.length > 0) return q;
  return null;
}

// Require any logged-in user. Attaches req.auth.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearer(req);
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  (req as any).auth = payload;
  next();
}

// Like requireAuth but also accepts ?token= for media element URLs.
export function requireAuthMedia(req: Request, res: Response, next: NextFunction) {
  const token = getTokenFromAnywhere(req);
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  (req as any).auth = payload;
  next();
}

// Require a specific role (e.g. "CREATOR"). Stacks after requireAuth, but also works standalone.
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = getBearer(req);
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
    if (!roles.includes(payload.role)) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    (req as any).auth = payload;
    next();
  };
}

// Allow if logged-in user is the target user OR has one of the elevated roles.
// Used for /api/users/:id and /api/progress/:userId where students touch their own data.
export function requireSelfOrRole(paramName: string, ...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = getBearer(req);
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
    const targetId = req.params[paramName];
    if (payload.userId !== targetId && !roles.includes(payload.role)) {
      return res.status(403).json({ error: "Forbidden: not your record" });
    }
    (req as any).auth = payload;
    next();
  };
}
