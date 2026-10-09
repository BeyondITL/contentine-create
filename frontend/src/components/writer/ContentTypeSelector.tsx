'use client';

import {
  FileText, MessageCircle, Mail, AlignLeft, Megaphone, ListChecks,
} from 'lucide-react';
import type { WriterDocType } from '@/types';

interface ContentTypeSelectorProps {
  selected: WriterDocType;
  onSelect: (type: WriterDocType) => void;
}

const CONTENT_TYPES: {
  id: WriterDocType;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  { id: 'blog', label: 'Blog Post', description: 'Long-form articles with SEO structure', icon: FileText },
  { id: 'caption', label: 'Social Caption', description: 'Engaging social media posts', icon: MessageCircle },
  { id: 'email', label: 'Email', description: 'Professional emails and newsletters', icon: Mail },
  { id: 'description', label: 'Description', description: 'Product and video descriptions', icon: AlignLeft },
  { id: 'ad', label: 'Ad Copy', description: 'Persuasive ad copy variants', icon: Megaphone },
  { id: 'summary', label: 'Summary', description: 'Concise content summaries', icon: ListChecks },
];

/** Grid of 6 content type cards with selection state, dark mode, and 44px touch targets. */
export default function ContentTypeSelector({ selected, onSelect }: ContentTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3">
      {CONTENT_TYPES.map((type) => {
        const Icon = type.icon;
        const isSelected = selected === type.id;

        return (
          <button
            key={type.id}
            type="button"
            onClick={() => onSelect(type.id)}
            className={`
              bento-card p-3 md:p-4 min-h-[44px] text-left transition-all duration-200
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
              active:scale-[0.97] cursor-pointer
              ${isSelected
                ? 'ring-2 ring-accent/30 bg-accent-bg dark:bg-accent/[0.08]'
                : 'hover:bg-surface dark:hover:bg-white/[0.02]'
              }
            `}
          >
            <Icon
              size={20}
              className={`mb-2 transition-colors ${
                isSelected
                  ? 'text-accent'
                  : 'text-text-muted dark:text-[#888]'
              }`}
            />
            <p className={`text-[13px] md:text-[12px] font-semibold mb-0.5 transition-colors ${
              isSelected
                ? 'text-text dark:text-white'
                : 'text-text dark:text-[#E0E0E0]'
            }`}>
              {type.label}
            </p>
            <p className="text-[11px] md:text-[10px] text-text-muted leading-snug">
              {type.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
