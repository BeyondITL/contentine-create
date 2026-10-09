'use client';

import { Check, Monitor, Smartphone, Square } from 'lucide-react';
import { useCartoonStore } from '@/stores/cartoon-store';
import { CARTOON_STYLES, CARTOON_FORMATS } from '@/lib/cartoon/styles';

const FORMAT_ICONS = {
  '16:9': Monitor,
  '9:16': Smartphone,
  '1:1': Square,
} as const;

/**
 * Cartoon Studio — Step 2: pick a style + output format.
 * The grid renders every rig pack registered in CARTOON_STYLES (5 shipped);
 * adding a pack there appears here automatically with no wizard changes.
 */
export default function CartoonStyleStep() {
  const { styleId, setStyleId, formatId, setFormatId } = useCartoonStore();

  return (
    <div className="space-y-6">
      {/* Styles */}
      <div>
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Style</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CARTOON_STYLES.map((style) => {
            const isSelected = styleId === style.id;
            const Icon = style.icon;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => setStyleId(style.id)}
                className={`
                  relative flex flex-col items-start text-left p-4 rounded-xl border-2 transition-all
                  ${isSelected
                    ? 'border-primary bg-primary-bg dark:bg-primary/10 ring-1 ring-primary/20'
                    : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                  }
                `}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                )}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${style.accent}1a`, color: style.accent }}
                >
                  <Icon size={18} />
                </div>
                <p className="text-sm font-semibold text-text dark:text-white">{style.name}</p>
                <p className="text-xs text-muted mt-1">{style.description}</p>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted mt-2">
          {CARTOON_STYLES.length} styles available — each renders fully on your device.
        </p>
      </div>

      {/* Format */}
      <div>
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Format</h3>
        <div className="grid grid-cols-3 gap-3">
          {CARTOON_FORMATS.map((format) => {
            const isSelected = formatId === format.id;
            const Icon = FORMAT_ICONS[format.id];
            return (
              <button
                key={format.id}
                type="button"
                onClick={() => setFormatId(format.id)}
                className={`
                  flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 transition-all
                  ${isSelected
                    ? 'border-primary bg-primary-bg dark:bg-primary/10 ring-1 ring-primary/20'
                    : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                  }
                `}
              >
                <Icon size={18} className={isSelected ? 'text-primary' : 'text-muted'} />
                <span className="text-sm font-medium text-text dark:text-white">{format.label}</span>
                <span className="text-[11px] text-muted">{format.id}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
