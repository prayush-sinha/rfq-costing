export class ConflictError extends Error {
  constructor(
    message = "Quote was modified by another user or session. Please reload the latest version."
  ) {
    super(message);
    this.name = "ConflictError";
  }
}
