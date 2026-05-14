// In-memory registry of running claude subprocesses so a follow-up endpoint
// can send tool_result / user messages back to them. Module-level Map: one
// Node process owns all active chat streams (single-instance deployment).

import type { ChildProcess } from 'child_process';

export interface ActiveStream {
  process: ChildProcess;
  /** Send a follow-up user message (content blocks) to the running subprocess. */
  sendUserMessage: (content: unknown[]) => void;
}

const ACTIVE = new Map<string, ActiveStream>();

export function registerStream(id: string, stream: ActiveStream) {
  ACTIVE.set(id, stream);
}

export function unregisterStream(id: string) {
  ACTIVE.delete(id);
}

export function getStream(id: string): ActiveStream | undefined {
  return ACTIVE.get(id);
}
