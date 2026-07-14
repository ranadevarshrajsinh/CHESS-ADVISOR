import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, password } = body;
  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent") ?? undefined;
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    undefined;

  try {

  // ── Player login (no @ → chess username) ─────────────────────────────────────
  if (!id.includes("@")) {
    const player = await prisma.players.findUnique({
      where: { chess_username: id.toLowerCase().trim() },
      include: { app_user: true },
    });

    if (!player) {
      return NextResponse.json({ error: "Username not found. Please check your chess.com username." }, { status: 401 });
    }

    if (player.status !== "approved") {
      return NextResponse.json(
        { error: "PENDING_APPROVAL", message: "Your account is pending approval from your coach." },
        { status: 403 }
      );
    }

    // Auto-create an app_users account on first login for coach-added players
    let userId = player.user_id;
    if (!userId || !player.app_user) {
      const placeholderEmail = `${player.chess_username}@players.chessadvisor.internal`;
      const passwordHash = `*${crypto.randomBytes(32).toString("hex")}`;
      const newUser = await prisma.app_users.create({
        data: { email: placeholderEmail, password_hash: passwordHash, email_verified: true },
      });
      await prisma.players.update({
        where: { id: player.id },
        data: { user_id: newUser.id },
      });
      userId = newUser.id;
    }

    const { rawToken } = await createSession(userId, { userAgent, ipAddress });
    const response = NextResponse.json({ redirectTo: "/dashboard" });
    return setSessionCookie(response, rawToken);
  }

  // ── Staff login (has @ → email + password) ────────────────────────────────────
  if (!password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const user = await prisma.app_users.findUnique({
    where: { email_lower: id.toLowerCase().trim() },
    include: { profile: true, player: true },
  });

  // Always run bcrypt at full cost to prevent timing attacks regardless of user existence or migration status
  const DUMMY_HASH = "$2b$12$invalid.hash.for.timing.attack.prevention.only.x";
  const isMigrated = user?.password_hash === "[MIGRATED]";
  const hashToVerify = !user || isMigrated ? DUMMY_HASH : user.password_hash;
  const passwordOk = await verifyPassword(password, hashToVerify).catch(() => false);

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (isMigrated) {
    return NextResponse.json(
      { error: "PASSWORD_RESET_REQUIRED", message: "Please reset your password to continue." },
      { status: 403 }
    );
  }

  if (!passwordOk) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (!user.email_verified) {
    return NextResponse.json(
      { error: "EMAIL_NOT_VERIFIED", message: "Please verify your email before logging in." },
      { status: 403 }
    );
  }

  const { rawToken } = await createSession(user.id, { userAgent, ipAddress });

  let redirectTo = "/dashboard";
  const profile = user.profile;
  const player = user.player;

  if (profile) {
    if (profile.role === "admin") redirectTo = "/admin/dashboard";
    else if (profile.role === "academy_owner") {
      redirectTo = profile.status === "pending" ? "/academy/pending" : "/academy/dashboard";
    } else {
      redirectTo = profile.status === "pending" ? "/coach/pending" : "/coach/dashboard";
    }
  } else if (player) {
    redirectTo = player.status === "pending" ? "/pending" : "/dashboard";
  }

  const response = NextResponse.json({
    role: profile?.role ?? null,
    status: profile?.status ?? player?.status ?? null,
    redirectTo,
  });

  return setSessionCookie(response, rawToken);

  } catch (err) {
    console.error("[/api/auth/login] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
