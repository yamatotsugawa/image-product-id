import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}