import { NextRequest, NextResponse } from 'next/server';
import { getStream } from '@/lib/active-streams';

// POST /api/chat/respond
// Body shapes accepted:
//   { stream_id, type: 'tool_result', tool_use_id, content }
//     → sends a tool_result content block as a user message back to the CLI
//   { stream_id, type: 'text', text }
//     → sends a plain text user message (free-form follow-up)
//
// Used by the chat client to answer AskUserQuestion tool calls inline,
// without sending a fresh /api/chat/stream request (which would lose context).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      stream_id?: string;
      type?: 'tool_result' | 'text';
      tool_use_id?: string;
      content?: string;
      text?: string;
    };

    if (!body.stream_id) {
      return NextResponse.json({ error: 'stream_id is required' }, { status: 400 });
    }

    const stream = getStream(body.stream_id);
    if (!stream) {
      return NextResponse.json({ error: 'stream not found or ended' }, { status: 404 });
    }

    if (body.type === 'tool_result') {
      if (!body.tool_use_id || typeof body.content !== 'string') {
        return NextResponse.json({ error: 'tool_use_id and content required' }, { status: 400 });
      }
      stream.sendUserMessage([
        { type: 'tool_result', tool_use_id: body.tool_use_id, content: body.content },
      ]);
      return NextResponse.json({ ok: true });
    }

    if (body.type === 'text') {
      if (typeof body.text !== 'string' || !body.text.trim()) {
        return NextResponse.json({ error: 'text required' }, { status: 400 });
      }
      stream.sendUserMessage([{ type: 'text', text: body.text }]);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'unknown response type' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
