'use client';

/**
 * "AI-generated" visible disclosure label — EU AI Act Art. 50(2).
 *
 * Art. 50 requires that AI-generated or -manipulated media be disclosed to the
 * viewer. This is the VISIBLE layer, shown on generated-media result surfaces
 * (video / cartoon / image / thumbnail). The MACHINE-READABLE marking is written
 * into export metadata by the render engines via `getAiDisclosure()` in
 * `lib/ai-disclosure.ts` (Law L7 provenance embed) — the caption shown here and
 * the caption embedded there share that single source of truth.
 *
 * This is NOT the C2PA hash-signing manifest (operator ruling pending — design
 * only). It is the plaintext, user-facing disclosure.
 */

import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { getAiDisclosure } from '@/lib/ai-disclosure';

type Variant = 'badge' | 'corner';

export default function AiGeneratedBadge({
  variant = 'badge',
  className = '',
}: {
  variant?: Variant;
  className?: string;
}) {
  // Caption comes from user settings (localStorage) — read after mount to stay
  // SSR-safe and reflect the current preset without a full reload.
  const [caption, setCaption] = useState<string>('');
  useEffect(() => {
    setCaption(getAiDisclosure());
  }, []);

  const label = 'AI-generated';
  const title = caption || 'This media was generated with AI assistance.';

  if (variant === 'corner') {
    return (
      <span
        className={`absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold tracking-wide ${className}`}
        title={title}
        aria-label={title}
      >
        <Info className="w-2.5 h-2.5 shrink-0" strokeWidth={2} />
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/[0.1] text-accent text-[11px] font-semibold ${className}`}
      title={title}
      aria-label={title}
    >
      <Info className="w-3 h-3 shrink-0" strokeWidth={2} />
      {label}
    </span>
  );
}
