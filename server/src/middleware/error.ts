import type { Request, Response, NextFunction, RequestHandler } from 'express';

export interface HttpError extends Error {
  status?: number;
}

/** 404 handler — reached when no route matched. */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

/** Central error handler. Throw or next(err) anywhere to land here. */
export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
}

/** Wrap async route handlers so rejected promises reach errorHandler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Build a typed HTTP error: throw httpError(404, 'Item not found'). */
export function httpError(status: number, message: string): HttpError {
  const err: HttpError = new Error(message);
  err.status = status;
  return err;
}
