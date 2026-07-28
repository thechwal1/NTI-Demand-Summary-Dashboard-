import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "../../db/index.js";
import { ntiItems, sessions, uploads, users } from "../../db/schema.js";

const SESSION_LENGTH_MS = 7 * 24 * 60 * 60 * 1000;
const SUPER_ADMIN_USERNAME = "talha.mahmood";
const DEFAULT_ADMIN = {
  name: "Talha Mahmood",
  username: SUPER_ADMIN_USERNAME,
  password: "Faster@123",
  role: "admin",
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: scryptSync(password, salt, 64).toString("hex"),
  };
}

function passwordMatches(password: string, salt: string, storedHash: string) {
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
  };
}

async function ensureDefaultAdmin() {
  const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
  if (existingUsers.length > 0) return;

  const password = hashPassword(DEFAULT_ADMIN.password);
  await db
    .insert(users)
    .values({
      name: DEFAULT_ADMIN.name,
      username: DEFAULT_ADMIN.username,
      passwordHash: password.hash,
      passwordSalt: password.salt,
      role: DEFAULT_ADMIN.role,
    })
    .onConflictDoNothing({ target: users.username });
}

async function authenticate(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;

  const [record] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return record || null;
}

function requireAdmin(auth: Awaited<ReturnType<typeof authenticate>>) {
  return auth?.user.role === "admin";
}

function uploadResponse(upload: typeof uploads.$inferSelect) {
  return {
    id: upload.id,
    storeId: upload.storeId,
    storeName: upload.storeName,
    filename: upload.filename,
    label: upload.label,
    timestamp: upload.uploadedAt.getTime(),
    dateStr: upload.uploadedAt.toLocaleString(),
    totalItems: upload.totalItems,
    totalValue: upload.totalValue,
    uniqueSKUs: upload.uniqueSkus,
    matched: upload.matched,
    results: upload.results,
    notFound: upload.notFound,
    uploadedBy: upload.uploadedBy,
  };
}

async function handleLogin(req: Request) {
  await ensureDefaultAdmin();
  const body = await req.json().catch(() => null) as { username?: string; password?: string } | null;
  const username = body?.username?.trim().toLowerCase();
  const password = body?.password || "";
  if (!username || !password) return json({ error: "Username and password are required." }, 400);

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user || !passwordMatches(password, user.passwordSalt, user.passwordHash)) {
    return json({ error: "Invalid username or password." }, 401);
  }

  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    tokenHash: tokenHash(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_LENGTH_MS),
  });

  return json({ token, user: publicUser(user) });
}

async function handleData(auth: NonNullable<Awaited<ReturnType<typeof authenticate>>>) {
  const [savedUploads, savedNti, savedUsers] = await Promise.all([
    db.select().from(uploads).orderBy(desc(uploads.uploadedAt)),
    db.select().from(ntiItems),
    requireAdmin(auth) ? db.select().from(users).orderBy(users.id) : Promise.resolve([]),
  ]);

  const nti = Object.fromEntries(
    savedNti.map((item) => [
      item.itemNumber,
      { name: item.name, price: item.price, class: item.classification },
    ]),
  );

  return json({
    user: publicUser(auth.user),
    users: savedUsers.map(publicUser),
    uploads: savedUploads.map(uploadResponse),
    nti,
  });
}

async function createUpload(req: Request, auth: NonNullable<Awaited<ReturnType<typeof authenticate>>>) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !body.storeId || !body.filename || !Array.isArray(body.results)) {
    return json({ error: "Invalid upload data." }, 400);
  }

  const uploadedAt = new Date(Number(body.timestamp) || Date.now());
  const [saved] = await db.insert(uploads).values({
    storeId: String(body.storeId),
    storeName: String(body.storeName || body.storeId),
    filename: String(body.filename),
    label: String(body.label || body.filename),
    uploadedAt,
    totalItems: Number(body.totalItems) || 0,
    totalValue: Number(body.totalValue) || 0,
    uniqueSkus: Number(body.uniqueSKUs) || 0,
    matched: Number(body.matched) || 0,
    results: body.results,
    notFound: Array.isArray(body.notFound) ? body.notFound : [],
    uploadedBy: auth.user.name,
  }).returning();

  return json(uploadResponse(saved), 201);
}

async function replaceNti(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, { name?: unknown; price?: unknown; class?: unknown }> | null;
  if (!body || Array.isArray(body)) return json({ error: "Invalid NTI database." }, 400);

  const entries = Object.entries(body).filter(([itemNumber]) => itemNumber.trim());
  await db.transaction(async (tx) => {
    await tx.delete(ntiItems);
    if (entries.length > 0) {
      await tx.insert(ntiItems).values(entries.map(([itemNumber, item]) => ({
        itemNumber: itemNumber.trim(),
        name: String(item?.name || ""),
        price: Number(item?.price) || 1,
        classification: String(item?.class || ""),
        updatedAt: new Date(),
      })));
    }
  });

  return json({ success: true, count: entries.length });
}

async function createUser(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const name = String(body?.name || "").trim();
  const username = String(body?.username || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const role = body?.role === "admin" ? "admin" : "user";
  if (!name || !username || password.length < 6) return json({ error: "Valid user details are required." }, 400);

  const hashed = hashPassword(password);
  try {
    const [saved] = await db.insert(users).values({
      name,
      username,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      role,
    }).returning();
    return json(publicUser(saved), 201);
  } catch {
    return json({ error: "Username already exists." }, 409);
  }
}

async function updateUser(req: Request, id: number) {
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return json({ error: "User not found." }, 404);
  if (existing.username === SUPER_ADMIN_USERNAME) return json({ error: "The super admin cannot be edited." }, 403);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const name = String(body?.name || "").trim();
  const username = String(body?.username || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const role = body?.role === "admin" ? "admin" : "user";
  if (!name || !username || (password && password.length < 6)) return json({ error: "Valid user details are required." }, 400);

  const changes: Partial<typeof users.$inferInsert> = { name, username, role };
  if (password) {
    const hashed = hashPassword(password);
    changes.passwordHash = hashed.hash;
    changes.passwordSalt = hashed.salt;
  }

  try {
    const [saved] = await db.update(users).set(changes).where(eq(users.id, id)).returning();
    return json(publicUser(saved));
  } catch {
    return json({ error: "Username already exists." }, 409);
  }
}

export default async (req: Request) => {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
    const resource = parts[0] || "";
    const id = Number(parts[1]);

    if (resource === "login" && req.method === "POST") return handleLogin(req);

    const auth = await authenticate(req);
    if (!auth) return json({ error: "Please sign in again." }, 401);

    if (resource === "session" && req.method === "GET") return json({ user: publicUser(auth.user) });
    if (resource === "data" && req.method === "GET") return handleData(auth);
    if (resource === "logout" && req.method === "POST") {
      const token = (req.headers.get("authorization") || "").slice(7);
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
      return json({ success: true });
    }
    if (resource === "uploads" && req.method === "POST") return createUpload(req, auth);
    if (resource === "uploads" && req.method === "DELETE" && Number.isInteger(id)) {
      await db.delete(uploads).where(eq(uploads.id, id));
      return json({ success: true });
    }

    if (!requireAdmin(auth)) return json({ error: "Administrator access is required." }, 403);

    if (resource === "nti" && req.method === "PUT") return replaceNti(req);
    if (resource === "users" && req.method === "POST") return createUser(req);
    if (resource === "users" && req.method === "PUT" && Number.isInteger(id)) return updateUser(req, id);
    if (resource === "users" && req.method === "DELETE" && Number.isInteger(id)) {
      const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existing) return json({ error: "User not found." }, 404);
      if (existing.username === SUPER_ADMIN_USERNAME) return json({ error: "The super admin cannot be deleted." }, 403);
      await db.delete(users).where(eq(users.id, id));
      return json({ success: true });
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("API error", error);
    return json({ error: "The server could not complete the request." }, 500);
  }
};

export const config = {
  path: "/api/*",
};
