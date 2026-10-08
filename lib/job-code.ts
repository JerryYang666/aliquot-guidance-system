/**
 * Job codes: 8 letters from an alphabet without I, L and O, which are easy to
 * misread as 1 and 0. 23^8 ≈ 7.8e10 codes, so guessing one is impractical.
 * Shown as "ABCD-EFGH"; typing ignores case, spaces and dashes.
 */
export const JOB_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const JOB_CODE_LENGTH = 8;

export function generateJobCode(): string {
  const bytes = new Uint8Array(JOB_CODE_LENGTH * 2);
  let code = "";
  while (code.length < JOB_CODE_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      // Rejection sampling keeps every letter equally likely.
      if (b < 230 && code.length < JOB_CODE_LENGTH)
        code += JOB_CODE_ALPHABET[b % 23];
    }
  }
  return code;
}

export function normalizeJobCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, "");
}

export function isValidJobCode(code: string): boolean {
  return new RegExp(`^[${JOB_CODE_ALPHABET}]{${JOB_CODE_LENGTH}}$`).test(code);
}

export function formatJobCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
