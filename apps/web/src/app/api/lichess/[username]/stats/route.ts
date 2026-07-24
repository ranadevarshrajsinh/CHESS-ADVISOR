import { NextRequest, NextResponse } from "next/server";
import { fetchLichessPerfStats } from "@/lib/chess/integrations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  try {
    const stats = await fetchLichessPerfStats(username);
    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
