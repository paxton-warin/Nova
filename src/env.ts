import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_PATH: z.string().min(1).default("./data/nova-browser.db"),
  /** Number of reverse proxies in front of Node (e.g. 1 for nginx/Caddy/Cloudflare tunnel). Required for correct client IPs and secure cookies. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(32).default(0),
  /**
   * Set `true` when the app is served only over HTTPS so session cookies are marked Secure.
   * Leave `false` for local HTTP development.
   */
  SESSION_COOKIE_SECURE: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1"),
  /** Use `none` when the UI is on a different site than the API (with CORS + VITE_API_BASE_URL); requires SESSION_COOKIE_SECURE. */
  SESSION_COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  SESSION_SECRET: z.string().min(16),
  MASTER_ADMIN_USERNAME: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  MASTER_ADMIN_PASSWORD: z.string().min(8),
  MASTER_ADMIN_TOTP_SECRET: z.string().min(16),
  ENABLE_ERUDA_BY_DEFAULT: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  LIBCURL_TRANSPORT_PATH: z
    .string()
    .default("/libcurl/index.mjs"),
  WISP_PATH: z.string().default("/wisp/"),
  /**
   * Comma-separated list of allowed browser origins for credentialed API calls (e.g. https://d123.cloudfront.net).
   * Set when the UI is on a different host than the API (with VITE_API_BASE_URL on the frontend build).
   * Requires HTTPS on the UI and SESSION_COOKIE_SECURE=true for cookies to be sent cross-site.
   */
  CORS_ALLOW_ORIGINS: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
    ),
});

export const env = envSchema.parse(process.env);

if (env.SESSION_COOKIE_SAMESITE === "none" && !env.SESSION_COOKIE_SECURE) {
  throw new Error(
    "SESSION_COOKIE_SAMESITE=none requires SESSION_COOKIE_SECURE=true (browsers require Secure cookies for SameSite=None).",
  );
}
