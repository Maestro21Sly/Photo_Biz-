/** Keep all mobile password validation/copy aligned with the API policy. */
export const MIN_PASSWORD_LENGTH = 10;
export const PASSWORD_LENGTH_HINT = `At least ${MIN_PASSWORD_LENGTH} characters`;

export function meetsPasswordLength(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
