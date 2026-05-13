import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET() {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, string | number | null>;
    for (const [key, value] of Object.entries(body)) {
      if (value === null || value === '') {
        await pool.query('DELETE FROM settings WHERE key = ?', [key]);
      } else {
        await pool.query(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, String(value)]
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
