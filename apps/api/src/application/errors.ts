export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: 400 | 401 | 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export function notFound(): never {
  throw new ApplicationError("NOT_FOUND", 404, "Trip not found");
}
