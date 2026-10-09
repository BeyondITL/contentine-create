'use client';

import { Suspense } from 'react';
import { Languages } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';
import VideoTranslator from '@/components/translate/VideoTranslator';
import ModelRequirements from '@/components/shared/ModelRequirements';

/** /translate — Video translation and multi-language lip-sync page. */
export default function TranslatePage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-0.5">
          <Languages size={20} className="text-primary" />
          <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em]">
            Video Translation
          </h1>
        </div>
        <p className="text-sm text-text-muted mt-0.5">
          Translate and re-lip-sync your videos into 10+ languages using browser-native AI.
        </p>
      </div>

      {/* On-device model gate — transcription (Whisper) + re-voicing (Kokoro), with backend fallback */}
      <div className="mb-6">
        <ModelRequirements
          feature="translate"
          description="Transcription and re-voicing run on your device. These models download once, then work offline."
        />
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        }
      >
        <VideoTranslator />
      </Suspense>
    </div>
  );
}
