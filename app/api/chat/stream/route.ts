import { NextRequest } from 'next/server';
import { streamClaude } from '@/lib/claude-process';
import { registerStream, unregisterStream } from '@/lib/active-streams';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

// Allow larger bodies for base64 image data
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, sessionId, cwd, permissionMode, model, maxBudget, images, allowedTools: requestedAllowed } = body;

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

    const { stream, process: proc, sendUserMessage } = streamClaude({
      prompt,
      sessionId,
      cwd,
      permissionMode: permissionMode || 'default',
      model,
      maxBudget,
      images: Array.isArray(images) ? images as Array<{ data: string; mimeType: string }> : undefined,
      // Always auto-allow AskUserQuestion (it just asks the user something — no
      // destructive side effects). Plus any tools the client pre-approved this turn
      // via the permission card's "Yes, allow once" button (which passes tool names
      // through to grant the *specific* tool, not just change the global mode).
      allowedTools: Array.from(new Set([
        'AskUserQuestion',
        ...(Array.isArray(requestedAllowed) ? requestedAllowed.filter((x: unknown): x is string => typeof x === 'string') : []),
      ])),
    });

    // Register this subprocess so /api/chat/respond can write follow-ups to it.
    const streamId = randomUUID();
    registerStream(streamId, { process: proc, sendUserMessage });
    proc.on('close', () => unregisterStream(streamId));

    // Prepend a `stream_init` event so the client knows the stream_id for follow-ups.
    // Built as a fresh ReadableStream that emits the init event then pipes the original.
    const initLine = JSON.stringify({ type: 'stream_init', stream_id: streamId }) + '\n';
    const encoder = new TextEncoder();
    const reader = stream.getReader();
    const composed = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(initLine));
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch { /* swallow — the inner stream handles its own errors */ }
        controller.close();
      },
      cancel() {
        reader.cancel().catch(() => {});
      },
    });

    return new Response(composed, {
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
