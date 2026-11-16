import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { neon } from "@neondatabase/serverless";

const scryptAsync = promisify(scrypt);
const root = dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Set it in .env.local or the host environment.");
}

const sql = neon(databaseUrl);
const app = express();
const sessionCookie = "67divisor_session";
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function slugify(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function sessionHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function readCookie(request, name) {
  const cookies = request.headers.cookie || "";
  const item = cookies.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : "";
}

function setSessionCookie(response, token) {
  const attributes = [
    `${sessionCookie}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${sessionLifetimeMs / 1000}`
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

function clearSessionCookie(response) {
  const attributes = [`${sessionCookie}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex || !/^[0-9a-f]{128}$/i.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

async function initializeDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS divisor_groups (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS divisor_group_data (
      group_id UUID PRIMARY KEY REFERENCES divisor_groups(id) ON DELETE CASCADE,
      state JSONB NOT NULL CHECK (jsonb_typeof(state) = 'object'),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS divisor_sessions (
      token_hash TEXT PRIMARY KEY,
      group_id UUID NOT NULL REFERENCES divisor_groups(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS divisor_sessions_expiry_idx ON divisor_sessions (expires_at)`;
}

async function findSession(request) {
  const token = readCookie(request, sessionCookie);
  if (!/^[0-9a-f]{64}$/i.test(token)) return null;
  const [session] = await sql`
    SELECT groups.id, groups.name
    FROM divisor_sessions AS sessions
    JOIN divisor_groups AS groups ON groups.id = sessions.group_id
    WHERE sessions.token_hash = ${sessionHash(token)}
      AND sessions.expires_at > now()
    LIMIT 1
  `;
  return session || null;
}

async function requireSession(request, response) {
  const session = await findSession(request);
  if (!session) {
    response.status(401).json({ error: "Sua sessão expirou. Entre novamente." });
    return null;
  }
  return session;
}

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", asyncRoute(async (_request, response) => {
  await sql`SELECT 1`;
  response.json({ ok: true, database: "ok" });
}));

app.post("/api/auth/register", asyncRoute(async (request, response) => {
  const rawName = request.body && request.body.name;
  const password = request.body && request.body.password;
  if (typeof rawName !== "string" || rawName.trim().length < 1 || rawName.trim().length > 60) {
    throw new HttpError(400, "Digite um nome de grupo válido (até 60 caracteres).");
  }
  if (typeof password !== "string" || password.length < 6 || password.length > 256) {
    throw new HttpError(400, "A senha precisa ter entre 6 e 256 caracteres.");
  }

  const name = rawName.trim();
  const slug = slugify(name);
  if (!slug) throw new HttpError(400, "Digite o nome do grupo (use letras ou números).");

  const token = randomBytes(32).toString("hex");
  const passwordHash = await hashPassword(password);
  let created;
  try {
    [created] = await sql`
      WITH new_group AS (
        INSERT INTO divisor_groups (id, name, slug, password_hash)
        VALUES (${randomUUID()}, ${name}, ${slug}, ${passwordHash})
        RETURNING id
      )
      INSERT INTO divisor_sessions (token_hash, group_id, expires_at)
      SELECT ${sessionHash(token)}, id, ${new Date(Date.now() + sessionLifetimeMs).toISOString()}::timestamptz
      FROM new_group
      RETURNING group_id
    `;
    if (!created) throw new Error("Group and session creation returned no result.");
  } catch (error) {
    if (error.code === "23505") {
      throw new HttpError(409, "Já existe um grupo com esse nome. Escolha outro ou entre.");
    }
    throw error;
  }

  setSessionCookie(response, token);
  response.status(201).json({ group: { id: created.group_id, name } });
}));

app.post("/api/auth/login", asyncRoute(async (request, response) => {
  const rawName = request.body && request.body.name;
  const password = request.body && request.body.password;
  if (typeof rawName !== "string" || typeof password !== "string") {
    throw new HttpError(400, "Digite o nome do grupo e a senha.");
  }

  const slug = slugify(rawName.trim());
  const [group] = slug ? await sql`
    SELECT id, name, password_hash FROM divisor_groups WHERE slug = ${slug} LIMIT 1
  ` : [];
  if (!group || !await verifyPassword(password, group.password_hash)) {
    throw new HttpError(401, "Nome do grupo ou senha incorretos.");
  }

  const token = randomBytes(32).toString("hex");
  await sql`
    INSERT INTO divisor_sessions (token_hash, group_id, expires_at)
    VALUES (
      ${sessionHash(token)},
      ${group.id},
      ${new Date(Date.now() + sessionLifetimeMs).toISOString()}::timestamptz
    )
  `;
  setSessionCookie(response, token);
  response.json({ group: { id: group.id, name: group.name } });
}));

app.get("/api/auth/session", asyncRoute(async (request, response) => {
  const group = await findSession(request);
  if (!group) {
    response.status(401).json({ error: "Sua sessão expirou. Entre novamente." });
    return;
  }
  response.json({ group: { id: group.id, name: group.name } });
}));

app.post("/api/auth/logout", asyncRoute(async (request, response) => {
  const token = readCookie(request, sessionCookie);
  if (/^[0-9a-f]{64}$/i.test(token)) {
    await sql`DELETE FROM divisor_sessions WHERE token_hash = ${sessionHash(token)}`;
  }
  clearSessionCookie(response);
  response.status(204).end();
}));

app.get("/api/data", asyncRoute(async (request, response) => {
  const group = await requireSession(request, response);
  if (!group) return;
  const [row] = await sql`
    SELECT state FROM divisor_group_data WHERE group_id = ${group.id} LIMIT 1
  `;
  response.json({ state: row ? row.state : null });
}));

app.put("/api/data", asyncRoute(async (request, response) => {
  const group = await requireSession(request, response);
  if (!group) return;
  const state = request.body && request.body.state;
  if (!state || typeof state !== "object" || Array.isArray(state)
      || !Array.isArray(state.pessoas) || !Array.isArray(state.itens)) {
    throw new HttpError(400, "Os dados do grupo precisam conter as listas de pessoas e produtos.");
  }
  await sql`
    INSERT INTO divisor_group_data (group_id, state, updated_at)
    VALUES (${group.id}, ${JSON.stringify(state)}::jsonb, now())
    ON CONFLICT (group_id)
    DO UPDATE SET state = EXCLUDED.state, updated_at = now()
  `;
  response.status(204).end();
}));

const staticFiles = express.static(root, { dotfiles: "deny", index: false });
app.get("/", (_request, response) => response.sendFile(join(root, "index.html")));
app.get(["/index.html", "/login.html", "/produtos.html", "/pagamentos.html", "/auth.js", "/script.js", "/style.css"], staticFiles);
app.use("/api", (_request, response) => response.status(404).json({ error: "Rota não encontrada." }));
app.use((_request, response) => response.sendStatus(404));
app.use((error, _request, response, next) => {
  if (response.headersSent) return next(error);
  const status = Number.isInteger(error.status) ? error.status : Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (status >= 500) console.error("Request failed:", error);
  response.status(status).json({
    error: status >= 500 ? "Erro interno ao acessar o serviço." : error.message
  });
});

await initializeDatabase();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => console.log(`67 Divisor listening on ${host}:${port}`));
