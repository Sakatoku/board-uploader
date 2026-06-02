/**
 * Transport-agnostic HTTP error.
 *
 * Handlers throw HttpError; each adapter (Vercel function, local express dev
 * server) maps it to a response. Keeping this separate from any framework lets
 * the same handler run in multiple environments and be unit tested directly.
 */

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message: string) => new HttpError(404, message);
