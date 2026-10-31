/**
 * Stable error codes for cartoon commands. Callers (UI, MCP bridge, tests)
 * branch on `code`, never on message text.
 */
export type CommandErrorCode =
  | 'INVALID_ARGUMENT' // malformed or missing arguments
  | 'INVALID_PATCH' // patch cannot be applied or produces an invalid plan
  | 'REVISION_CONFLICT' // expectedRevision is stale; nothing changed
  | 'IDEMPOTENCY_KEY_REUSED' // same key, different operation or payload
  | 'FORBIDDEN' // actor lacks permission or project is outside its grant
  | 'NOT_FOUND' // project / run / artifact does not exist in this workspace
  | 'LIMIT_EXCEEDED' // a size, count, duration or concurrency bound
  | 'UNSUPPORTED_ENGINE' // e.g. a voice engine this build cannot run
  | 'RENDERER_UNAVAILABLE' // no browser renderer is connected/capable
  | 'TAKES_MISSING' // render requested while lines lack matching voice takes
  | 'BUSY' // another run is active for this workspace
  | 'RUN_NOT_SUCCEEDED' // artifact requested for a run without output
  | 'MISSING_ASSET'
  | 'CORRUPT_ASSET'
  | 'UNSUPPORTED_FORMAT'
  | 'STORAGE_FAILED';

export class CommandError extends Error {
  constructor(
    readonly code: CommandErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CommandError';
  }

  toJSON(): { code: CommandErrorCode; message: string; details?: Record<string, unknown> } {
    return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) };
  }
}

/** Run failure codes recorded on a terminal run. */
export type RunFailureCode = 'RENDER_FAILED' | 'RENDERER_UNAVAILABLE' | 'OUTPUT_INVALID' | 'LIMIT_EXCEEDED' | 'INTERRUPTED' | 'STORAGE_FAILED';
