import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const BCRYPT_ROUNDS = 12;
const SESSION_COOKIE = "chess_session";
const SESSION_DAYS = 30;

// ── Password ──────────────────────────────────────────────────────────────────

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// ── Token helpers ─────────────────────────────────────────────────────────────

export function generateSecureToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${seg()}-${seg()}`;
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export function setSessionCookie(response: NextResponse, rawToken: string) {
  response.cookies.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/", httpOnly: true });
  return response;
}

function getRawTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// ── Session ───────────────────────────────────────────────────────────────────

export async function createSession(
  userId: string,
  opts: { userAgent?: string; ipAddress?: string } = {}
) {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const session = await prisma.user_sessions.create({
    data: {
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      ...(opts.userAgent && { user_agent: opts.userAgent }),
      ...(opts.ipAddress && { ip_address: opts.ipAddress }),
    },
  });

  return { rawToken, session };
}

export async function getSessionFromRequest(request: Request) {
  const rawToken = getRawTokenFromRequest(request);
  if (!rawToken) return null;
  return getSessionByToken(rawToken);
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!rawToken) return null;
  return getSessionByToken(rawToken);
}

async function getSessionByToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const session = await prisma.user_sessions.findUnique({
    where: { token_hash: tokenHash },
    include: {
      app_user: {
        include: { profile: true, player: true },
      },
    },
  });

  if (!session || session.expires_at < new Date()) return null;

  // Rolling expiry — update last_used_at without await to avoid latency
  prisma.user_sessions
    .update({ where: { id: session.id }, data: { last_used_at: new Date() } })
    .catch(() => {});

  return session;
}

export async function invalidateSession(tokenHash: string) {
  await prisma.user_sessions.deleteMany({ where: { token_hash: tokenHash } });
}

export async function invalidateAllUserSessions(userId: string) {
  await prisma.user_sessions.deleteMany({ where: { user_id: userId } });
}

// ── Auth guard for API routes ─────────────────────────────────────────────────

type SessionData = Awaited<ReturnType<typeof getSessionByToken>>;

export async function requireAuth(request: Request): Promise<SessionData | NextResponse> {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return session;
}

export async function requireRole(
  request: Request,
  role: string
): Promise<SessionData | NextResponse> {
  const session = await requireAuth(request);
  if (session instanceof NextResponse) return session;
  if (session.app_user.profile?.role !== role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}

// ── Email verification tokens ─────────────────────────────────────────────────

export async function createEmailVerificationToken(userId: string) {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Delete any existing unused tokens for this user
  await prisma.email_verification_tokens.deleteMany({ where: { user_id: userId, used_at: null } });

  await prisma.email_verification_tokens.create({
    data: { user_id: userId, token_hash: tokenHash, expires_at: expiresAt },
  });

  return rawToken;
}

export async function verifyEmailToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const token = await prisma.email_verification_tokens.findUnique({
    where: { token_hash: tokenHash },
    include: { app_user: { include: { player: true } } },
  });

  if (!token || token.used_at || token.expires_at < new Date()) return null;

  await prisma.$transaction([
    prisma.email_verification_tokens.update({
      where: { id: token.id },
      data: { used_at: new Date() },
    }),
    prisma.app_users.update({
      where: { id: token.user_id },
      data: { email_verified: true },
    }),
  ]);

  return token.app_user;
}

// ── Password reset tokens ─────────────────────────────────────────────────────

export async function createPasswordResetToken(userId: string) {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.password_reset_tokens.deleteMany({ where: { user_id: userId, used_at: null } });
  await prisma.password_reset_tokens.create({
    data: { user_id: userId, token_hash: tokenHash, expires_at: expiresAt },
  });

  return rawToken;
}

export async function verifyPasswordResetToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const token = await prisma.password_reset_tokens.findUnique({
    where: { token_hash: tokenHash },
    include: { app_user: true },
  });
  if (!token || token.used_at || token.expires_at < new Date()) return null;
  return token;
}

export async function consumePasswordResetToken(tokenId: string, newPasswordHash: string, userId: string) {
  await prisma.$transaction([
    prisma.password_reset_tokens.update({ where: { id: tokenId }, data: { used_at: new Date() } }),
    prisma.app_users.update({ where: { id: userId }, data: { password_hash: newPasswordHash, email_verified: true } }),
  ]);
}

// ── Registration ──────────────────────────────────────────────────────────────

export async function registerStaffUser(data: {
  email: string;
  password: string;
  fullName: string;
  role: "coach" | "academy_owner";
  academyId?: string;
  academyName?: string;
  academyCity?: string;
  academyDescription?: string;
}) {
  const emailLower = data.email.toLowerCase();
  const existing = await prisma.app_users.findUnique({ where: { email_lower: emailLower } });
  if (existing) throw new Error("EMAIL_TAKEN");

  const passwordHash = await hashPassword(data.password);

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.app_users.create({
      data: { email: data.email, password_hash: passwordHash },
    });

    let resolvedAcademyId = data.academyId ?? null;

    if (data.role === "academy_owner") {
      const academy = await tx.academies.create({
        data: {
          name: data.academyName!,
          city: data.academyCity ?? null,
          description: data.academyDescription ?? null,
          owner_id: newUser.id,
          status: "pending",
          invite_code: generateInviteCode(),
        },
      });
      resolvedAcademyId = academy.id;
    }

    await tx.profiles.create({
      data: {
        id: newUser.id,
        email: data.email,
        full_name: data.fullName,
        role: data.role,
        academy_id: resolvedAcademyId,
        status: data.role === "academy_owner" || data.academyId ? "pending" : "approved",
        invite_code: data.role === "coach" ? generateInviteCode() : null,
      },
    });

    return newUser;
  });

  const rawVerificationToken = await createEmailVerificationToken(user.id);
  return { user, rawVerificationToken };
}

export async function registerPlayerUser(data: {
  email: string;
  fullName: string;
  chessUsername?: string;
  lichessUsername?: string;
  activePlatform?: string;
  coachId: string;
}) {
  const emailLower = data.email.toLowerCase();
  const chessLower = data.chessUsername?.toLowerCase() || null;
  const lichessLower = data.lichessUsername?.toLowerCase() || null;

  const [existingEmail, existingByChess, existingByLichess] = await Promise.all([
    prisma.app_users.findUnique({ where: { email_lower: emailLower } }),
    chessLower ? prisma.players.findUnique({ where: { chess_username: chessLower } }) : Promise.resolve(null),
    lichessLower ? prisma.players.findUnique({ where: { lichess_username: lichessLower } }) : Promise.resolve(null),
  ]);

  if (existingEmail) throw new Error("EMAIL_TAKEN");
  if (existingByChess?.user_id || existingByLichess?.user_id) throw new Error("USERNAME_TAKEN");

  const existingUsername = existingByChess ?? existingByLichess;
  const activePlatform = data.activePlatform ?? (chessLower ? "chess.com" : "lichess");

  // Players have no password — store an unusable placeholder that bcrypt.compare always rejects
  const passwordHash = `*${crypto.randomBytes(32).toString("hex")}`;

  const preApproved = existingUsername?.status === "approved";

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.app_users.create({
      data: { email: data.email, password_hash: passwordHash },
    });

    if (existingUsername) {
      // Claim existing unclaimed player record; set coach_id from invite code if not already assigned
      await tx.players.update({
        where: { id: existingUsername.id },
        data: {
          user_id: newUser.id,
          email: data.email,
          full_name: data.fullName,
          ...(chessLower ? { chess_username: chessLower } : {}),
          ...(lichessLower ? { lichess_username: lichessLower } : {}),
          active_platform: activePlatform,
          ...(existingUsername.coach_id == null ? { coach_id: data.coachId } : {}),
        },
      });
    } else {
      await tx.players.create({
        data: {
          chess_username: chessLower,
          lichess_username: lichessLower,
          active_platform: activePlatform,
          full_name: data.fullName,
          coach_id: data.coachId,
          status: "pending",
          email: data.email,
          user_id: newUser.id,
        },
      });
    }

    return newUser;
  });

  if (preApproved) {
    await prisma.app_users.update({
      where: { id: user.id },
      data: { email_verified: true },
    });
    return { user, preApproved: true };
  }

  return { user, preApproved: false };
}

// ── Delete user (cascades to sessions, tokens, profile, player) ───────────────

export async function deleteUser(userId: string) {
  await prisma.app_users.delete({ where: { id: userId } });
}
