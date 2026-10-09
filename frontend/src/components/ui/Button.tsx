'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger' | 'icon';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-[#0A0A0A] dark:bg-white hover:bg-[#1A1A1A] dark:hover:bg-[#E8E8E8] text-white dark:text-[#0A0A0A] shadow-[0_1px_2px_rgba(0,0,0,0.15),0_0_0_0.5px_rgba(0,0,0,0.08)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_2px_rgba(255,255,255,0.1)] dark:hover:shadow-[0_2px_8px_rgba(255,255,255,0.15)]',
  secondary: 'bg-white dark:bg-dark-secondary hover:bg-[#F7F8FA] dark:hover:bg-[#333] text-text dark:text-[#E0E0E0] shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12)]',
  accent: 'bg-accent/90 hover:bg-accent text-white shadow-sm shadow-accent/20',
  ghost: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-text-secondary dark:text-[#AAA]',
  danger: 'text-danger hover:bg-danger/[0.06]',
  icon: 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-text-muted',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 min-h-[44px] md:min-h-0 md:py-1.5 text-[13px] md:text-[12px] rounded-xl md:rounded-lg gap-1.5',
  md: 'px-4 py-2.5 min-h-[44px] md:min-h-0 text-[14px] md:text-[13px] rounded-xl gap-2',
  lg: 'px-5 py-3 min-h-[44px] text-[14px] md:text-[13px] rounded-xl gap-2',
};

const iconSizeStyles: Record<ButtonSize, string> = {
  sm: 'w-[44px] h-[44px] md:w-7 md:h-7 rounded-xl md:rounded-lg',
  md: 'w-[44px] h-[44px] md:w-9 md:h-9 rounded-xl md:rounded-lg',
  lg: 'w-[44px] h-[44px] md:w-10 md:h-10 rounded-xl',
};

/** Reusable button with variants, loading state, dark mode, and 44px mobile touch targets. */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, icon, disabled, className = '', children, ...rest }, ref) => {
    const isIcon = variant === 'icon';
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center font-semibold transition-all duration-150 active:scale-[0.97] select-none
          focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
          ${isIcon ? iconSizeStyles[size] : sizeStyles[size]}
          ${variantStyles[variant]}
          ${isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}
          ${className}
        `.trim()}
        {...rest}
      >
        {isLoading ? (
          <>
            <Spinner />
            {children && <span className="opacity-0">{children}</span>}
          </>
        ) : (
          <>
            {icon}
            {children}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;

/** 18px inline spinner for loading states. */
function Spinner() {
  return (
    <svg className="animate-spin w-[18px] h-[18px] absolute" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
