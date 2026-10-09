'use client';

import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff, Check, AlertCircle } from 'lucide-react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  success?: boolean;
  showCharCount?: boolean;
  inputSize?: 'sm' | 'md' | 'lg';
}

/** Text input with label, error/success states, 44px mobile touch targets, and iOS zoom prevention. */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, success, showCharCount, maxLength, inputSize = 'md', className = '', type = 'text', ...rest }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const currentType = isPassword && showPassword ? 'text' : type;
    const charCount = typeof rest.value === 'string' ? rest.value.length : 0;
    const nearLimit = maxLength && charCount > maxLength * 0.8;

    const sizes = {
      sm: 'px-3 py-2.5 min-h-[44px] md:min-h-0 md:py-1.5 text-[16px] md:text-[12px] rounded-xl md:rounded-lg',
      md: 'px-3.5 py-3 min-h-[44px] md:min-h-0 md:py-2.5 text-[16px] md:text-[13px] rounded-xl',
      lg: 'px-4 py-3.5 min-h-[44px] text-[16px] md:text-[13px] rounded-xl',
    };

    return (
      <div className={className}>
        {label && (
          <label className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">{label}</label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type={currentType}
            maxLength={maxLength}
            className={`
              w-full ${sizes[inputSize]} bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0]
              placeholder:text-text-muted/40 transition-all duration-200
              border focus:outline-none focus:ring-2
              ${error
                ? 'border-danger focus:ring-danger/15 focus:border-danger'
                : success
                  ? 'border-secondary focus:ring-secondary/15 focus:border-secondary'
                  : 'border-black/[0.08] dark:border-white/[0.08] focus:ring-primary/15 focus:border-primary/30'
              }
              ${(isPassword || success) ? 'pr-12' : ''}
            `}
            {...rest}
          />

          {/* Right-side icon — touch-friendly toggle for password */}
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-8 md:h-8 flex items-center justify-center text-text-muted/50 hover:text-text-secondary transition-colors cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
          {success && !isPassword && (
            <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
          )}
        </div>

        {/* Bottom row — error or char count */}
        <div className="flex items-center justify-between mt-1">
          {error ? (
            <p className="flex items-center gap-1 text-[11px] text-danger">
              <AlertCircle className="w-3 h-3" />
              {error}
            </p>
          ) : (
            <span />
          )}
          {showCharCount && maxLength && (
            <p className={`text-[10px] font-mono ${nearLimit ? 'text-warning' : 'text-text-muted/40'}`}>
              {charCount}/{maxLength}
            </p>
          )}
        </div>
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;

/* ── Textarea variant ── */
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  showCharCount?: boolean;
}

/** Textarea with touch-friendly padding and iOS zoom prevention via 16px font on mobile. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, showCharCount, maxLength, className = '', ...rest }, ref) => {
    const charCount = typeof rest.value === 'string' ? rest.value.length : 0;
    const nearLimit = maxLength && charCount > maxLength * 0.8;

    return (
      <div className={className}>
        {label && (
          <label className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">{label}</label>
        )}
        <textarea
          ref={ref}
          maxLength={maxLength}
          className={`
            w-full px-3.5 py-3 min-h-[120px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0]
            placeholder:text-text-muted/40 transition-all duration-200 resize-none
            border focus:outline-none focus:ring-2
            ${error
              ? 'border-danger focus:ring-danger/15 focus:border-danger'
              : 'border-black/[0.08] dark:border-white/[0.08] focus:ring-primary/15 focus:border-primary/30'
            }
          `}
          {...rest}
        />
        <div className="flex items-center justify-between mt-1">
          {error ? (
            <p className="flex items-center gap-1 text-[11px] text-danger">
              <AlertCircle className="w-3 h-3" />
              {error}
            </p>
          ) : (
            <span />
          )}
          {showCharCount && maxLength && (
            <p className={`text-[10px] font-mono ${nearLimit ? 'text-warning' : 'text-text-muted/40'}`}>
              {charCount}/{maxLength}
            </p>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
