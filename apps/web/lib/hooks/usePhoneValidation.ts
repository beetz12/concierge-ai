"use client";

import { useState, useCallback, useMemo } from "react";

/**
 * E.164 Phone Number Validation Utility
 *
 * This module provides shared phone validation functionality
 * for use across all forms in the application.
 *
 * E.164 Format: +[country code][subscriber number]
 * US Example: +13105551234
 */

// Regex patterns for phone validation
const E164_REGEX = /^\+1\d{10}$/; // US E.164: +1 followed by 10 digits
const DIGITS_ONLY_REGEX = /\D/g;

/**
 * Normalizes a phone number to E.164 format (+1XXXXXXXXXX)
 * Accepts various input formats and standardizes them.
 *
 * @param phone - Phone number in any format
 * @returns Normalized E.164 format phone number
 *
 * @example
 * normalizePhoneNumber("(310) 555-1234") // "+13105551234"
 * normalizePhoneNumber("310-555-1234")   // "+13105551234"
 * normalizePhoneNumber("1-310-555-1234") // "+13105551234"
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(DIGITS_ONLY_REGEX, "");

  // Handle US numbers (10 digits)
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // Handle US numbers with country code (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // Already has + prefix, just clean non-digits after the +
  if (phone.startsWith("+")) {
    return phone.replace(/[^\d+]/g, "");
  }

  // Default: add + prefix
  return `+${digits}`;
}

/**
 * Validates if a phone number is in valid US E.164 format
 *
 * @param phone - Phone number to validate (should be normalized first)
 * @returns true if valid E.164 format, false otherwise
 *
 * @example
 * isValidE164Phone("+13105551234") // true
 * isValidE164Phone("310-555-1234") // false (not normalized)
 */
export function isValidE164Phone(phone: string): boolean {
  return E164_REGEX.test(phone);
}

/**
 * Validates a phone number input and returns validation result
 *
 * @param phone - Raw phone number input from user
 * @returns Validation result with error message if invalid
 */
export function validatePhoneNumber(phone: string): {
  isValid: boolean;
  error: string;
  normalized: string;
} {
  const trimmed = phone.trim();

  // Empty check
  if (!trimmed) {
    return {
      isValid: false,
      error: "Phone number is required",
      normalized: "",
    };
  }

  // Extract digits to check length
  const digits = trimmed.replace(DIGITS_ONLY_REGEX, "");

  // Too short
  if (digits.length < 10) {
    return {
      isValid: false,
      error: `Phone number too short (${digits.length}/10 digits)`,
      normalized: "",
    };
  }

  // Too long (allowing for country code)
  if (digits.length > 11) {
    return {
      isValid: false,
      error: `Phone number too long (${digits.length} digits)`,
      normalized: "",
    };
  }

  // Normalize and validate
  const normalized = normalizePhoneNumber(trimmed);

  if (!isValidE164Phone(normalized)) {
    return {
      isValid: false,
      error: "Invalid US phone number format",
      normalized: "",
    };
  }

  return {
    isValid: true,
    error: "",
    normalized,
  };
}

/**
 * Phone validation result type
 */
export interface PhoneValidationState {
  value: string;
  normalized: string;
  error: string;
  isValid: boolean;
  isTouched: boolean;
}

/**
 * React hook for phone number validation with real-time feedback
 *
 * @param initialValue - Initial phone number value
 * @returns Phone validation state and handlers
 *
 * @example
 * const { value, error, isValid, onChange, onBlur } = usePhoneValidation();
 *
 * <input
 *   type="tel"
 *   value={value}
 *   onChange={onChange}
 *   onBlur={onBlur}
 *   className={error ? "border-red-500" : "border-gray-300"}
 * />
 * {error && <span className="text-red-500">{error}</span>}
 */
export function usePhoneValidation(initialValue: string = "") {
  const [state, setState] = useState<PhoneValidationState>({
    value: initialValue,
    normalized: "",
    error: "",
    isValid: false,
    isTouched: false,
  });

  /**
   * Validate and update state
   */
  const validate = useCallback((phone: string, touched: boolean = true) => {
    const result = validatePhoneNumber(phone);
    setState({
      value: phone,
      normalized: result.normalized,
      error: touched && phone.length > 0 ? result.error : "",
      isValid: result.isValid,
      isTouched: touched,
    });
    return result.isValid;
  }, []);

  /**
   * Handle input change event
   */
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      // Validate on change but only show errors after touch
      validate(newValue, state.isTouched);
    },
    [validate, state.isTouched]
  );

  /**
   * Handle blur event (field loses focus)
   */
  const onBlur = useCallback(() => {
    // Mark as touched and revalidate to show any errors
    validate(state.value, true);
  }, [validate, state.value]);

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    setState({
      value: initialValue,
      normalized: "",
      error: "",
      isValid: false,
      isTouched: false,
    });
  }, [initialValue]);

  /**
   * Set value programmatically
   */
  const setValue = useCallback(
    (value: string) => {
      validate(value, state.isTouched);
    },
    [validate, state.isTouched]
  );

  return {
    // State
    value: state.value,
    normalized: state.normalized,
    error: state.error,
    isValid: state.isValid,
    isTouched: state.isTouched,

    // Handlers
    onChange,
    onBlur,
    reset,
    setValue,
    validate,
  };
}

/**
 * Format a phone number for display (pretty format)
 *
 * @param phone - Phone number (any format)
 * @returns Formatted phone number for display
 *
 * @example
 * formatPhoneDisplay("+13105551234") // "(310) 555-1234"
 * formatPhoneDisplay("3105551234")   // "(310) 555-1234"
 */
export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(DIGITS_ONLY_REGEX, "");

  // Get last 10 digits (removes country code if present)
  const last10 = digits.slice(-10);

  if (last10.length !== 10) {
    return phone; // Return original if not enough digits
  }

  return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
}
