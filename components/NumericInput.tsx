import React, { useState, useEffect, useMemo } from 'react';
import { normalizeNumberInput, persianArabicToEnglish } from '../utils/formatters';

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'onFocus'> {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  fractionDigits?: number;
  label?: string;
  useFormatting?: boolean;
  error?: string;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  step = 1,
  min,
  max,
  fractionDigits,
  onKeyDown,
  label,
  useFormatting = true,
  error,
  onFocus,
  ...rest
}) => {
  const [internalValue, setInternalValue] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  const formatter = useMemo(() => new Intl.NumberFormat('en-US', {
    maximumFractionDigits: fractionDigits === 0 ? 0 : (fractionDigits ?? 20),
    useGrouping: useFormatting,
  }), [fractionDigits, useFormatting]);

  // Effect to sync from parent `value` prop to our internal display value
  useEffect(() => {
    // When not editing, the display value should always reflect the formatted parent value.
    if (!isEditing) {
      setInternalValue(formatter.format(value || 0));
    }
  }, [value, isEditing, formatter]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsEditing(true);
    // Switch to the raw, unformatted number for easy editing.
    // If the value is 0, show an empty string to make it easier to type a new number.
    setInternalValue(value === 0 ? '' : String(value));
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsEditing(false); // Signal that editing is finished.
    
    // Parse the raw input from our internal state
    const normalized = normalizeNumberInput(internalValue);
    let numericValue = normalized === '' ? 0 : parseFloat(normalized);
    
    // Validation
    if (!isFinite(numericValue)) numericValue = 0;
    if (typeof min === 'number') numericValue = Math.max(min, numericValue);
    if (typeof max === 'number') numericValue = Math.min(max, numericValue);
    
    // Inform the parent about the final, validated number.
    // The `useEffect` will then run because `isEditing` becomes false,
    // which will format the number for display based on the new prop from the parent.
    onChange(numericValue);
    
    if (rest.onBlur) rest.onBlur(e);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = persianArabicToEnglish(e.target.value);
    setInternalValue(rawValue); // Keep the user's raw input for display while typing

    const normalized = normalizeNumberInput(rawValue);
    
    // If input is empty or just a dash/dot, it's not a valid number yet.
    // However, if the user deleted everything, we should update the value to 0.
    if (normalized === '') {
        if (rawValue.trim() === '') {
            onChange(0);
        }
        return; // Don't proceed for intermediate inputs like "-" or "1."
    }
    
    const numericValue = parseFloat(normalized);

    // Only call onChange if we have a valid number
    if (isFinite(numericValue)) {
      onChange(numericValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const currentValue = parseFloat(normalizeNumberInput(internalValue)) || 0;
      const delta = e.key === 'ArrowUp' ? step : -step;
      let nextValue = parseFloat((currentValue + delta).toPrecision(15));
      if (typeof min === 'number') nextValue = Math.max(min, nextValue);
      if (typeof max === 'number') nextValue = Math.min(max, nextValue);
      
      // Call parent onChange and also update local state for immediate feedback
      onChange(nextValue);
      setInternalValue(String(nextValue));
    }
    if (onKeyDown) onKeyDown(e);
  };

  const { className, ...otherProps } = rest;

  const hasColorClasses = className && (className.includes('bg-') || className.includes('text-'));

  const finalClassName = [
    "border rounded-md p-2 text-sm focus:ring-1",
    error ? "border-red-500 focus:ring-red-500 focus:border-red-500" : "border-slate-300 focus:ring-indigo-500 focus:border-indigo-500",
    'w-full',
    !hasColorClasses && 'bg-white text-gray-900', // Conditionally add defaults
    'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed', // Default disabled styles
    className, // User-provided classes are applied last to allow overrides
  ].filter(Boolean).join(' ');


  return (
    <div>
        {label && <label htmlFor={otherProps.id || otherProps.name} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}
        <input
          {...otherProps}
          type="text"
          inputMode="decimal"
          dir="ltr"
          value={internalValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-label={label || 'numeric input'}
          className={finalClassName}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default NumericInput;