import { kv } from "@vercel/kv";

export function kvAvailable(): boolean {
  // @vercel/kv reads these env vars at runtime (Vercel KV or Upstash Redis REST)
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function getProgress(syncKey: string) {
  const key = `progress:${syncKey}`;
  return await kv.get(key);
}

export async function putProgress(syncKey: string, progress: unknown) {
  const key = `progress:${syncKey}`;
  await kv.set(key, progress);
}
