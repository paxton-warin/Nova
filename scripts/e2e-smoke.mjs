/**
 * End-to-end smoke checks against a disposable DB:
 * 1) Open support ticket with attachment only + fetch attachment bytes
 * 2) Admin screen share: start → user sees pending → accept → post frame → admin polls frame
 *
 * Requires a valid root `.env` (SESSION_SECRET, MASTER_ADMIN_*).
 * Usage: `npm run e2e:smoke` from the repo root.
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import * as OTPAuth from "otpauth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });

const required = ["SESSION_SECRET", "MASTER_ADMIN_USERNAME", "MASTER_ADMIN_PASSWORD", "MASTER_ADMIN_TOTP_SECRET"];
for (const key of required) {
  if (!process.env[key]?.trim()) {
    console.error(`Missing ${key} in .env (see .env.example).`);
    process.exit(1);
  }
}

const port = Number(process.env.E2E_PORT ?? "40177");
const dbPath = path.join(root, "data", "e2e-smoke.db");

function cookieHeader(map) {
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function applySetCookies(map, response) {
  const list = response.headers.getSetCookie?.() ?? [];
  for (const line of list) {
    const pair = line.split(";")[0];
    const i = pair.indexOf("=");
    if (i === -1) continue;
    map.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

async function fetchSession(url, map, init = {}) {
  const headers = { ...init.headers };
  if (map.size > 0) headers.Cookie = cookieHeader(map);
  const res = await fetch(url, { ...init, headers });
  applySetCookies(map, res);
  return res;
}

function totpToken() {
  const secret = process.env.MASTER_ADMIN_TOTP_SECRET.trim();
  const totp = new OTPAuth.TOTP({
    issuer: "Nova Browser",
    label: "Nova Browser",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.generate();
}

async function waitForServer(base) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/api/alerts`);
      if (r.ok) return;
    } catch {
      // still starting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not become ready in time.");
}

async function main() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  try {
    fs.unlinkSync(dbPath);
  } catch {
    // ignore
  }

  const child = spawn(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "src/server.ts"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(base);

    const userCookies = new Map();
    const adminCookies = new Map();

    const username = `e2e_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const password = "E2ESmokePass9";

    let res = await fetchSession(
      `${base}/api/auth/register`,
      userCookies,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      },
    );
    if (!res.ok) {
      throw new Error(`Register failed: ${res.status} ${await res.text()}`);
    }

    res = await fetchSession(`${base}/api/messages/inbox`, userCookies);
    if (!res.ok) throw new Error(`Inbox failed: ${res.status}`);

    const form = new FormData();
    form.append("subject", "E2E attachment-only");
    form.append("body", "");
    form.append("files", new Blob([Buffer.from("fake png bytes")], { type: "image/png" }), "shot.png");

    res = await fetchSession(`${base}/api/messages/tickets`, userCookies, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      throw new Error(`Create ticket (multipart) failed: ${res.status} ${await res.text()}`);
    }

    res = await fetchSession(`${base}/api/messages/inbox`, userCookies);
    const inbox = await res.json();
    const tickets = inbox.tickets ?? [];
    const ticket = tickets.find((t) => t.subject === "E2E attachment-only");
    if (!ticket) throw new Error("New ticket not found in inbox.");
    const first = ticket.messages?.[0];
    if (!first?.attachments?.length) {
      throw new Error("Expected first message to include attachments.");
    }
    const attUrl = first.attachments[0].url;
    if (!attUrl.startsWith("/api/")) throw new Error("Unexpected attachment url shape.");

    res = await fetchSession(`${base}${attUrl}`, userCookies);
    if (!res.ok) throw new Error(`Attachment GET failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("Attachment body empty.");

    res = await fetchSession(
      `${base}/api/auth/login`,
      adminCookies,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: process.env.MASTER_ADMIN_USERNAME.trim(),
          password: process.env.MASTER_ADMIN_PASSWORD,
          totpToken: totpToken(),
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Master admin login failed: ${res.status} ${await res.text()}`);
    }

    res = await fetchSession(`${base}/api/admin/sessions`, adminCookies);
    if (!res.ok) throw new Error(`Admin sessions failed: ${res.status}`);
    const { sessions } = await res.json();
    const target = sessions.find((s) => s.username === username);
    if (!target?.session_id) {
      throw new Error("Could not find target user session in admin list.");
    }

    res = await fetchSession(`${base}/api/admin/sessions/${encodeURIComponent(target.session_id)}/screen-share`, adminCookies, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Start screen share failed: ${res.status} ${await res.text()}`);
    const { requestId } = await res.json();

    res = await fetchSession(`${base}/api/session/screen-share`, userCookies);
    const poll = await res.json();
    if (poll.request?.id !== requestId || poll.request?.status !== "pending") {
      throw new Error(`Expected pending screen share for user; got ${JSON.stringify(poll)}`);
    }

    res = await fetchSession(`${base}/api/session/screen-share/${encodeURIComponent(requestId)}/respond`, userCookies, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept: true }),
    });
    if (!res.ok) throw new Error(`Respond screen share failed: ${res.status} ${await res.text()}`);

    const jpegPrefix = "data:image/jpeg;base64,";
    const payload = jpegPrefix + "A".repeat(1600);
    res = await fetchSession(`${base}/api/session/screen-share/${encodeURIComponent(requestId)}/frame`, userCookies, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: payload }),
    });
    if (!res.ok) throw new Error(`Post frame failed: ${res.status} ${await res.text()}`);

    res = await fetchSession(`${base}/api/admin/screen-share/${encodeURIComponent(requestId)}`, adminCookies);
    if (!res.ok) throw new Error(`Admin poll failed: ${res.status}`);
    const share = await res.json();
    if (!share.frame?.dataUrl?.startsWith("data:image/jpeg")) {
      throw new Error("Admin did not receive frame payload.");
    }

    res = await fetchSession(`${base}/api/admin/screen-share/${encodeURIComponent(requestId)}/end`, adminCookies, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`End screen share failed: ${res.status}`);

    console.log("e2e-smoke: all checks passed.");
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
