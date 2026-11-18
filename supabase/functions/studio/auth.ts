import { db } from "./db.ts";
import { scrypt } from "node:crypto";

const encoder = new TextEncoder();
const cookieName = "__Host-studio_session";
const lifetime = 7 * 24 * 60 * 60;
export const dashboardOrigin = "https://ruba-gh.github.io";
const browserSessionLifetime = 8 * 60 * 60;

export function dashboardRequest(request: Request) {
  return request.headers.get("Origin") === dashboardOrigin;
}
const scryptCost = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

function hex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(size: number) {
  return hex(crypto.getRandomValues(new Uint8Array(size)));
}

export function matches(a: string, b: string) {
  const one = encoder.encode(a);
  const two = encoder.encode(b);
  let difference = one.length ^ two.length;
  for (let i = 0; i < two.length; i++) difference |= (one[i] ?? 0) ^ two[i];
  return difference === 0;
}

async function digest(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function derive(password: string, salt: string) {
  return new Promise<string>((resolve, reject) => {
    scrypt(password, salt, 32, scryptCost, (error, result) => {
      if (error) reject(error);
      else resolve(result.toString("hex"));
    });
  });
}

export async function passwordHash(password: string) {
  const salt = randomHex(16);
  return salt + ":" + await derive(password, salt);
}

export async function checkPassword(password: string, hash: string | null | undefined) {
  const [salt, expected] = (hash ?? "").split(":");
  const actual = await derive(password, salt || "00000000000000000000000000000000");
  return !!expected && matches(actual, expected);
}

function sessionCookie(token: string, age: number) {
  return cookieName + "=" + token + "; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=" + age;
}

function getToken(request: Request) {
  if (dashboardRequest(request)) {
    return request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  }
  return request.headers.get("Cookie")?.match(/(?:^|;\s*)__Host-studio_session=([a-f0-9]{64})(?:;|$)/)?.[1];
}

export async function principalFor(request: Request) {
  const token = getToken(request);
  if (!token) return null;
  return db.prepare("SELECT principal FROM sessions WHERE token=? AND expires>?")
    .bind(await digest(token), Math.floor(Date.now() / 1000)).first<string>("principal");
}

export async function createSession(principal: string, request: Request) {
  const dashboard = dashboardRequest(request);
  const age = dashboard ? browserSessionLifetime : lifetime;
  const token = randomHex(32);
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires<=?").bind(now),
    db.prepare("INSERT INTO sessions (token,principal,expires) VALUES (?,?,?)").bind(await digest(token), principal, now + age),
  ]);
  return dashboard ? { token } : { cookie: sessionCookie(token, age) };
}

export async function endSession(request: Request) {
  const token = getToken(request);
  if (token) await db.prepare("DELETE FROM sessions WHERE token=?").bind(await digest(token)).run();
  return sessionCookie("", 0);
}

export async function canAttempt(request: Request, action: string) {
  const address = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  const span = 15 * 60;
  const now = Math.floor(Date.now() / 1000);
  const boundary = Math.floor(now / span) * span + span;
  const bucket = await digest(address + ":" + action + ":" + boundary);
  const results = await db.batch([
    db.prepare("DELETE FROM login_attempts WHERE expires<=?").bind(now),
    db.prepare("INSERT INTO login_attempts (bucket, attempts, expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=login_attempts.attempts+1")
      .bind(bucket, boundary),
    db.prepare("SELECT attempts FROM login_attempts WHERE bucket=?").bind(bucket),
  ]);
  return Number((results[2].results[0] as { attempts?: number } | undefined)?.attempts) <= (action === "setup" ? 10 : 25);
}
