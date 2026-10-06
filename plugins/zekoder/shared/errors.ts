/** A thrown value's message, for display; non-Error throws are stringified. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
