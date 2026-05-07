import { NextRequest } from 'next/server';
import { streamClaude } from '@/lib/claude-process';
import { existsSync } from 'fs';

// Allow larger bodies for base64 image data
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, sessionId, cwd, permissionMode, model, maxBudget, images } = body;

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!cwd || typeof cwd !== 'string' || !existsSync(cwd)) {
      return new Response(JSON.stringify({ error: 'valid cwd (working directory) is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { stream } = streamClaude({
      prompt,
      sessionId,
      cwd,
      permissionMode: permissionMode || 'default',
      model,
      maxBudget,
      images: Array.isArray(images) ? images as Array<{ data: string; mimeType: string }> : undefined,
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
