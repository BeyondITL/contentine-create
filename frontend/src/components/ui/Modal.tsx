'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeButton?: boolean;
  className?: string;
}

/** Size styles only apply on md+ — mobile is always full-width bottom sheet. */
const sizeStyles = {
  sm: 'md:max-w-[400px]',
  md: 'md:max-w-[520px]',
  lg: 'md:max-w-[680px]',
};

/** Accessible modal — bottom sheet on mobile, centered dialog on desktop. */
export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeButton = true,
  className = '',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  /* Escape key closes */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeButton) onClose();
    },
    [onClose, closeButton]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  /* Focus trap — auto-focus modal on open */
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
      {/* Backdrop — on mobile, clicking above the sheet closes it */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]"
        onClick={closeButton ? onClose : undefined}
      />

      {/* Dialog — bottom sheet on mobile, centered on md+ */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={`
          relative w-full bg-white dark:bg-dark-secondary focus:outline-none
          fixed bottom-0 inset-x-0 rounded-t-2xl max-h-[90vh] overflow-y-auto
          animate-sheet-up
          md:static md:rounded-2xl md:max-h-none md:overflow-visible
          md:mx-auto md:animate-[modalEnter_200ms_ease-out]
          border-t border-black/[0.06] dark:border-white/[0.06]
          md:border md:border-black/[0.06] md:dark:border-white/[0.06]
          ${sizeStyles[size]}
          ${className}
        `}
        style={{ boxShadow: '0 16px 64px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Drag handle on mobile */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/10" />
        </div>

        {/* Header */}
        {(title || closeButton) && (
          <div className="flex items-start justify-between px-5 md:px-6 pt-3 md:pt-6 pb-0">
            <div>
              {title && (
                <h2 id="modal-title" className="text-[16px] font-bold text-text dark:text-[#E0E0E0] tracking-[-0.01em]">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-[12px] text-text-muted mt-1 leading-relaxed">{description}</p>
              )}
            </div>
            {/* Close button with 44px touch target */}
            {closeButton && (
              <button
                onClick={onClose}
                className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-auto md:h-auto flex items-center justify-center -mr-2 -mt-1 md:p-1.5 md:-mr-1.5 text-text-muted/40 hover:text-text-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.04] rounded-xl md:rounded-lg transition-all duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        {children && (
          <div className="px-5 md:px-6 py-5">{children}</div>
        )}

        {/* Footer — extra bottom padding on mobile for safe area */}
        {footer && (
          <div className="px-5 md:px-6 pb-6 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
