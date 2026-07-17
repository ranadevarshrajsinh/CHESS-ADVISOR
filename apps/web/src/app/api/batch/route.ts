import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { username, game_urls, time_class } = await request.json();

    if (!username || !Array.isArray(game_urls) || game_urls.length === 0) {
      return NextResponse.json({ error: "username and game_urls[] are required" }, { status: 400 });
    }

    const tc = time_class ?? null;

    const existing = await prisma.batch_jobs.findFirst({
      where: { username, status: { in: ["pending", "processing"] }, time_class: tc },
      orderBy: { created_at: "desc" },
      select: { id: true, status: true, created_at: true, game_urls: true, time_class: true },
    });
    if (existing) return NextResponse.json(existing);

    const job = await prisma.batch_jobs.create({
      data: { username, game_urls, status: "pending", time_class: tc },
    });

    // Wake the worker if it's spun down (Render free tier)
    const workerUrl = process.env.STOCKFISH_WORKER_URL;
    if (workerUrl) {
      fetch(workerUrl).catch(() => {});
    }

    return NextResponse.json(job);
  } catch (err) {
    console.error("Unexpected error in POST /api/batch:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const username = searchParams.get("username");

  if (jobId) {
    const job = await prisma.batch_jobs.findUnique({ where: { id: jobId } });
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(job);
  }

  if (username) {
    const jobs = await prisma.batch_jobs.findMany({
      where: { username },
      orderBy: { created_at: "desc" },
      take: 20,
      select: { id: true, username: true, status: true, created_at: true, time_class: true, result: true },
    });

    const summary = jobs.map((j) => {
      const r = j.result as any;
      return {
        id: j.id,
        username: j.username,
        status: j.status,
        created_at: j.created_at,
        time_class: j.time_class ?? null,
        summary: r ? { total_analyzed: r.total_analyzed, average_accuracy: r.average_accuracy } : null,
      };
    });

    return NextResponse.json(summary);
  }

  return NextResponse.json({ error: "jobId or username required" }, { status: 400 });
}
