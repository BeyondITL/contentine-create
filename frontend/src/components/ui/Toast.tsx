'use client';

import { useEffect, useState, useCallback, createContext, useContext, useRef } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

/* ── Types ── */
type ToastVariant = 'success' | 'error' | 'info' | 'action';

interface ToastData {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastContextValue {
  toast: (data: Omit<ToastData, 'id'>) => void;
}

/* ── Context ── */
const ToastContext = createContext<ToastContextValue | null>(null);

/** Hook to show toasts from any component. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/* ── Provider ── */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const counterRef = useRef(0);

  const toast = useCallback((data: Omit<ToastData, 'id'>) => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev, { ...data, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — bottom-center on mobile, bottom-right on desktop.
          SA-35: this is the app's ONLY channel for honest failure messages, so
          it is a live region. Without it a screen-reader user gets exactly the
          experience SA-33 gave everyone: the spinner stops and nothing is said. */}
      <div
        role="status"
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-20 left-4 right-4 md:bottom-6 md:left-auto md:right-6 flex flex-col-reverse gap-2 z-50 pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} data={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ── Individual toast ── */
const icons: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle className="w-[18px] h-[18px] text-secondary shrink-0" />,
  error: <AlertCircle className="w-[18px] h-[18px] text-danger shrink-0" />,
  info: <Info className="w-[18px] h-[18px] text-info shrink-0" />,
  action: <Info className="w-[18px] h-[18px] text-primary shrink-0" />,
};

const borderColors: Record<ToastVariant, string> = {
  success: 'border-l-secondary',
  error: 'border-l-danger',
  info: 'border-l-info',
  action: 'border-l-primary',
};

function ToastItem({ data, onDismiss }: { data: ToastData; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);
  const duration = data.duration ?? (data.variant === 'error' ? 6000 : data.variant === 'action' ? 0 : 4000);

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 150);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 150);
  };

  const isError = data.variant === 'error';

  return (
    <div
      // An error interrupts; everything else waits its turn (SA-35).
      role={isError ? 'alert' : undefined}
      aria-live={isError ? 'assertive' : undefined}
      className={`
        pointer-events-auto
        bg-white dark:bg-dark-secondary rounded-xl border border-black/[0.06] dark:border-white/[0.06] border-l-[3px] ${borderColors[data.variant]}
        p-4 flex items-start gap-3 w-full md:min-w-[320px] md:max-w-[420px]
        transition-all duration-200
        ${exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 animate-[slideUp_200ms_ease-out]'}
      `}
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)' }}
    >
      <div className="mt-0.5">{icons[data.variant]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-text dark:text-[#E0E0E0]">{data.title}</p>
        {data.description && (
          <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{data.description}</p>
        )}
        {data.action && (
          <button
            onClick={data.action.onClick}
            className="mt-2 text-[12px] font-semibold text-primary hover:text-primary-hover transition-colors cursor-pointer min-h-[44px] md:min-h-0"
          >
            {data.action.label}
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="text-text-muted/40 hover:text-text-muted transition-colors cursor-pointer shrink-0 p-2 -m-2 md:p-0 md:m-0 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
