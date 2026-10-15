import { describe, it, expect } from "vitest";
import {
  makeJWT,
  validateJWT,
  hashPassword,
  checkPasswordHash,
} from "./auth";

describe("JWT", () => {
  const userID = "123e4567-e89b-12d3-a456-426614174000";
  const secret = "test-secret";

  it("creates and validates a JWT", () => {
    const token = makeJWT(userID, 3600, secret);
    expect(validateJWT(token, secret)).toBe(userID);
  });

  it("rejects expired tokens", () => {
    const token = makeJWT(userID, -1, secret);
    expect(() => validateJWT(token, secret)).toThrow();
  });

  it("rejects tokens signed with the wrong secret", () => {
    const token = makeJWT(userID, 3600, secret);
    expect(() => validateJWT(token, "wrong-secret")).toThrow();
  });
});

describe("Password Hashing", () => {
  const password = "correctPassword123!";

  it("validates the correct password", async () => {
    const hash = await hashPassword(password);
    expect(await checkPasswordHash(password, hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword(password);
    expect(await checkPasswordHash("wrong-password", hash)).toBe(false);
  });
});