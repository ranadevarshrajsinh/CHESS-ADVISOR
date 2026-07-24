import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { username, filenames } = await request.json();

    if (!username || !Array.isArray(filenames)) {
      return NextResponse.json(
        { error: "username and filenames[] are required" },
        { status: 400 }
      );
    }

    if (filenames.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    const jobs = await prisma.analysis_jobs.findMany({
      where: {
        username,
        filename: { in: filenames },
        status: "completed",
      },
      orderBy: { created_at: "desc" },
      select: { filename: true, result: true },
    });

    // Take the most recent completed job per filename (findMany returns newest first)
    const statuses: Record<string, { analyzed: true; accuracy?: number } | { analyzed: false }> = {};
    for (const fn of filenames) statuses[fn] = { analyzed: false };
    for (const job of jobs) {
      if (statuses[job.filename]?.analyzed) continue;
      const result = job.result as any;
      const accuracy = typeof result?.game_accuracy === "number" ? result.game_accuracy : undefined;
      statuses[job.filename] = { analyzed: true, accuracy };
    }

    return NextResponse.json({ statuses });
  } catch (err) {
    console.error("Error in status-batch route:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
