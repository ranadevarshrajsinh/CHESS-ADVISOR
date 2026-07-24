import { NextResponse } from "next/server";
import { registerStaffUser, registerPlayerUser } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, email, password, fullName } = body;

  if (!type || !email || !fullName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (type !== "player") {
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
  }

  try {
    if (type === "player") {
      const { chessUsername, lichessUsername, activePlatform, coachId } = body;
      if (!coachId) {
        return NextResponse.json({ error: "Missing coachId" }, { status: 400 });
      }
      if (!chessUsername && !lichessUsername) {
        return NextResponse.json({ error: "Enter your Chess.com or Lichess username" }, { status: 400 });
      }
      const result = await registerPlayerUser({ email, fullName, chessUsername, lichessUsername, activePlatform, coachId });
      if (result.preApproved) {
        return NextResponse.json({ preApproved: true, message: "Your account is ready! You can now log in with your chess username." }, { status: 201 });
      }
      return NextResponse.json({ message: "Registration submitted. Your coach will review and approve your request." }, { status: 201 });
    }

    if (type === "coach" || type === "academy_owner") {
      const { academyId, academyName, academyCity, academyDescription } = body;
      if (type === "academy_owner" && !academyName) {
        return NextResponse.json({ error: "Academy name is required" }, { status: 400 });
      }
      const { user, rawVerificationToken } = await registerStaffUser({
        email, password, fullName, role: type, academyId, academyName, academyCity, academyDescription,
      });
      await sendVerificationEmail(email, rawVerificationToken, fullName);
      return NextResponse.json({ message: "Check your email to verify your account" }, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err: any) {
    if (err.message === "EMAIL_TAKEN") {
      return NextResponse.json({ error: "This email is already registered. Please log in instead." }, { status: 409 });
    }
    if (err.message === "USERNAME_TAKEN") {
      return NextResponse.json({ error: "This username is already registered." }, { status: 409 });
    }
    console.error("[signup]", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
