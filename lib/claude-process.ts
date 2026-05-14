import { spawn, ChildProcess } from 'child_process';

export interface ClaudeOptions {
  prompt: string;
  sessionId?: string;
  cwd: string;
  permissionMode?: 'default' | 'acceptEdits' | 'dangerouslySkipPermissions';
  model?: string;
  maxBudget?: number;
  systemPrompt?: string;
  allowedTools?: string[];
  // Base64 image data (with or without data: prefix) for vision input
  images?: Array<{ data: string; mimeType: string }>;
}

export function buildClaudeArgs(options: ClaudeOptions): string[] {
  // Always use stream-json bidirectional mode so we can send follow-up
  // messages (e.g., tool_result for AskUserQuestion) to the running CLI.
  const args: string[] = [
    '--print',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
  ];

  if (options.sessionId) args.push('--resume', options.sessionId);

  if (options.permissionMode === 'dangerouslySkipPermissions') {
    args.push('--dangerously-skip-permissions');
  } else if (options.permissionMode === 'acceptEdits') {
    args.push('--permission-mode', 'acceptEdits');
  }

  if (options.model) args.push('--model', options.model);
  if (options.maxBudget) args.push('--max-budget-usd', options.maxBudget.toString());
  if (options.systemPrompt) args.push('--system-prompt', options.systemPrompt);
  if (options.allowedTools?.length) args.push('--allowedTools', ...options.allowedTools);

  return args;
}

export interface StreamHandle {
  stream: ReadableStream<Uint8Array>;
  process: ChildProcess;
  /** Send a follow-up user message (content blocks) to the running subprocess. */
  sendUserMessage: (content: unknown[]) => void;
}

export function streamClaude(options: ClaudeOptions): StreamHandle {
  const args = buildClaudeArgs(options);
  const proc = spawn('claude', args, {
    cwd: options.cwd,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      proc.stdout.on('data', (data: Buffer) => {
        controller.enqueue(encoder.encode(data.toString()));
      });

      proc.stderr.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          controller.enqueue(encoder.encode(
            JSON.stringify({ type: 'error', message: msg }) + '\n',
          ));
        }
      });

      proc.on('close', () => controller.close());

      proc.on('error', (err) => {
        controller.enqueue(encoder.encode(
          JSON.stringify({ type: 'error', message: err.message }) + '\n',
        ));
        controller.close();
      });
    },
    cancel() {
      proc.kill('SIGTERM');
    },
  });

  // Build initial user message content blocks
  const contentBlocks: unknown[] = [{ type: 'text', text: options.prompt }];
  if (options.images?.length) {
    for (const img of options.images) {
      const base64 = img.data.replace(/^data:[^;]+;base64,/, '');
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: base64 },
      });
    }
  }

  // Helper to write a stream-json user message to stdin
  const sendUserMessage = (content: unknown[]) => {
    if (proc.killed || !proc.stdin.writable) return;
    proc.stdin.write(
      JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n',
    );
  };

  // Send the initial user turn
  sendUserMessage(contentBlocks);

  // IMPORTANT: do NOT close stdin here — keep it open so follow-up tool_result
  // and user messages can be written by /api/chat/respond throughout the session.
  // Stdin is closed when the subprocess exits (auto) or when the request is cancelled.

  return { stream, process: proc, sendUserMessage };
}
