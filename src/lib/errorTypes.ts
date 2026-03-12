/**
 * Custom error types for better error handling
 */

export class NetworkError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = "NetworkError";
  }
}

export class StreamError extends Error {
  constructor(
    message: string,
    public readonly isNetworkError?: boolean,
    public readonly isTimeout?: boolean
  ) {
    super(message);
    this.name = "StreamError";
  }
}

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class StorageError extends Error {
  constructor(message: string, public readonly isQuotaExceeded?: boolean) {
    super(message);
    this.name = "StorageError";
  }
}

/**
 * Type guard to check if error is a NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Type guard to check if error is a StreamError
 */
export function isStreamError(error: unknown): error is StreamError {
  return error instanceof StreamError;
}

/**
 * Type guard to check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Type guard to check if error is a StorageError
 */
export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

/**
 * Get a user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Check if error is recoverable (should retry)
 */
export function isRecoverableError(error: unknown): boolean {
  if (isNetworkError(error)) {
    // Retry on 5xx errors or network issues
    return !error.statusCode || error.statusCode >= 500;
  }
  if (isStreamError(error)) {
    return error.isNetworkError === true;
  }
  return false;
}
