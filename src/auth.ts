import argon2 from "argon2";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { UnauthorizedError } from "./errors.js";

type Payload = Pick<JwtPayload, "iss" | "sub" | "iat" | "exp">;

export function makeRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function makeJWT(
  userID: string,
  expiresIn: number,
  secret: string,
): string {
  const iat = Math.floor(Date.now() / 1000);

  const payload: Payload = {
    iss: "chirpy",
    sub: userID,
    iat,
    exp: iat + expiresIn,
  };

  return jwt.sign(payload, secret);
}

export function validateJWT(tokenString: string, secret: string): string {
  try {
    const decoded = jwt.verify(tokenString, secret);

    if (typeof decoded === "string" || !decoded.sub) {
      throw new UnauthorizedError("Invalid JWT");
    }

    return decoded.sub;
  } catch {
    throw new UnauthorizedError("Invalid JWT");
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function checkPasswordHash(
  password: string,
  hash: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function getAPIKey(req: Request): string {
  const authHeader = req.get("Authorization");

  if (!authHeader || !authHeader.startsWith("ApiKey ")) {
    throw new UnauthorizedError("Invalid API key");
  }

  return authHeader.slice("ApiKey ".length).trim();
}

export function getBearerToken(req: Request): string {
  const authHeader = req.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }

  return authHeader.slice("Bearer ".length).trim();
}