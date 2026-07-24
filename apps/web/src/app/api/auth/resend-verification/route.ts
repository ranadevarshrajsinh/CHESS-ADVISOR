import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createEmailVerificationToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (entry.count >= limit) return true;
  entry.count++;
  return false;
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const identifier = body?.email?.trim();
  if (!identifier) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const rateLimitKey = identifier.toLowerCase();
  if (isRateLimited(rateLimitKey, 3, 10 * 60 * 1000)) {
    return NextResponse.json(
      { message: "If this email exists, a verification link has been sent." },
      { status: 200 }
    );
  }

  let user;
  if (identifier.includes("@")) {
    user = await prisma.app_users.findUnique({ where: { email_lower: identifier.toLowerCase() } });
  } else {
    // Player login — look up by chess.com or lichess username
    const idLower = identifier.toLowerCase();
    const player = await prisma.players.findFirst({
      where: { OR: [{ chess_username: idLower }, { lichess_username: idLower }] },
      include: { app_user: true },
    });
    user = player?.app_user ?? null;
  }

  // Always return the same response to prevent email enumeration
  if (user && !user.email_verified) {
    const rawToken = await createEmailVerificationToken(user.id);
    await sendVerificationEmail(user.email, rawToken, "there");
  }

  return NextResponse.json({ message: "If this email exists, a verification link has been sent." });
}
