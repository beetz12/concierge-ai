"use client";

import { ReactNode, useId } from "react";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  /** Array of options to display */
  options: SegmentedControlOption<T>[];
  /** Currently selected value */
  value: T;
  /** Callback when selection changes */
  onChange: (value: T) => void;
  /** Optional name for form accessibility */
  name?: string;
  /** Optional aria-label for the group */
  "aria-label"?: string;
  /** Optional className for the container */
  className?: string;
}

/**
 * SegmentedControl - A tabbed button selector with large tap targets
 *
 * Used for binary or small-set selections like phone/text preference.
 * Provides better UX than radio buttons with larger click areas and
 * clear visual feedback of selection state.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  name,
  "aria-label": ariaLabel,
  className = "",
}: SegmentedControlProps<T>) {
  const groupId = useId();
  const groupName = name || `segmented-control-${groupId}`;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex rounded-xl bg-slate-800/50 p-1 border border-slate-700/50 ${className}`}
    >
      {options.map((option) => {
        const isSelected = value === option.value;
        const inputId = `${groupName}-${option.value}`;

        return (
          <label
            key={option.value}
            htmlFor={inputId}
            className={`
              relative flex items-center justify-center gap-2 px-5 py-3 rounded-lg
              cursor-pointer select-none transition-all duration-200
              font-medium text-sm min-w-[120px]
              ${isSelected
                ? "bg-primary-600 text-white shadow-lg shadow-primary-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
              }
            `}
          >
            <input
              type="radio"
              id={inputId}
              name={groupName}
              value={option.value}
              checked={isSelected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.icon && (
              <span className={`w-5 h-5 ${isSelected ? "text-white" : ""}`}>
                {option.icon}
              </span>
            )}
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
