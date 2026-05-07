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
  const hasImages = !!options.images?.length;

  // With images: use --input-format stream-json and pipe content blocks via stdin.
  // Without images: standard -p <prompt> (original behaviour).
  const args: string[] = hasImages
    ? ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']
    : ['-p', options.prompt, '--output-format', 'stream-json', '--verbose'];

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

export function streamClaude(options: ClaudeOptions): {
  stream: ReadableStream<Uint8Array>;
  process: ChildProcess;
} {
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

  if (options.images?.length) {
    // Build Anthropic content blocks and write as a single stream-json message
    const contentBlocks: unknown[] = [{ type: 'text', text: options.prompt }];
    for (const img of options.images) {
      const base64 = img.data.replace(/^data:[^;]+;base64,/, '');
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: base64 },
      });
    }
    proc.stdin.write(
      JSON.stringify({ type: 'user', message: { role: 'user', content: contentBlocks } }) + '\n',
    );
  }

  proc.stdin.end();

  return { stream, process: proc };
}
