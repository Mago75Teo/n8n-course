import { NextResponse } from "next/server";
import { kvAvailable } from "@/lib/kv";

export async function GET() {
  return NextResponse.json({
    ok: true,
    kvConfigured: kvAvailable(),
    now: new Date().toISOString(),
  });
}
