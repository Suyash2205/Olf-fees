/** An error caused by the caller's input (HTTP 400/409), as opposed to a server failure (500). */
export class InputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 409 = 400
  ) {
    super(message);
    this.name = "InputError";
  }
}
