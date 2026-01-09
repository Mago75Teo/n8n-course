import { NextRequest, NextResponse } from "next/server";
import { kvAvailable, getProgress, putProgress } from "@/lib/kv";

function getSyncKey(req: NextRequest): string | null {
  // sync key is sent from the client in header
  const k = req.headers.get("x-sync-key");
  if (!k) return null;
  const key = k.trim();
  if (key.length < 10 || key.length > 128) return null;
  return key;
}

export async function GET(req: NextRequest) {
  const syncKey = getSyncKey(req);
  if (!syncKey) return NextResponse.json({ error: "Missing sync key" }, { status: 401 });

  if (!kvAvailable()) {
    return NextResponse.json(
      { error: "KV not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env vars." },
      { status: 501 }
    );
  }

  const progress = await getProgress(syncKey);
  return NextResponse.json({ progress: progress ?? null });
}

export async function PUT(req: NextRequest) {
  const syncKey = getSyncKey(req);
  if (!syncKey) return NextResponse.json({ error: "Missing sync key" }, { status: 401 });

  if (!kvAvailable()) {
    return NextResponse.json(
      { error: "KV not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env vars." },
      { status: 501 }
    );
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const progress = body?.progress;
  if (!progress || typeof progress !== "object") {
    return NextResponse.json({ error: "Missing progress object" }, { status: 400 });
  }

  // Soft limit
  const size = JSON.stringify(progress).length;
  if (size > 500_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  await putProgress(syncKey, { ...progress, updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
