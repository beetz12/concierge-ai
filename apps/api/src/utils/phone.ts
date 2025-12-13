/**
 * Phone Number Utilities
 * Normalization and validation for VAPI compatibility
 */

/**
 * Normalize phone number to E.164 format for VAPI
 * Handles: (864) 555-1234, 864-555-1234, +1 (864) 555-1234, etc.
 * Returns: +18645551234 or null if invalid
 *
 * @param phone - Phone number in any common US format
 * @returns E.164 formatted phone (+1XXXXXXXXXX) or null if invalid
 */
export function normalizePhoneToE164(phone: string | undefined): string | null {
  if (!phone) return null;

  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // Handle 10-digit US numbers (add +1)
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // Handle 11-digit starting with 1 (US country code)
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // Invalid format for US numbers
  return null;
}
