export type ErrorCode =
  | 'INVALID_INPUT'
  | 'SIGN_IN_REQUIRED'
  | 'NOT_CURRENT_OWNER'
  | 'TOKEN_NOT_FOUND'
  | 'STATE_CHANGED'
  | 'CHOICE_UNAVAILABLE'
  | 'DAILY_LIMIT'
  | 'RATE_LIMITED'
  | 'CHAIN_UNAVAILABLE'
  | 'STORAGE_UNAVAILABLE';

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
