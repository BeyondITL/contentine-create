'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  ClipboardCopy, RotateCcw, ArrowRight, Check, Pencil, Eye,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import AiGeneratedBadge from '@/components/shared/AiGeneratedBadge';
import BuiltWithLlama from '@/components/shared/BuiltWithLlama';

interface WriterOutputProps {
  title: string;
  content: string;
  wordCount: number;
  onRegenerate: () => void;
  onContentChange: (content: string) => void;
  isGenerating: boolean;
}

/** Renders a simple markdown-like output: ## headings, **bold**, bullet points. */
function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    const trimmed = line.trimStart();

    // ## Heading
    if (trimmed.startsWith('## ')) {
      return (
        <h2
          key={i}
          className="text-[16px] md:text-[15px] font-bold text-text dark:text-white mt-4 mb-1.5 first:mt-0"
        >
          {trimmed.slice(3)}
        </h2>
      );
    }

    // ### Subheading
    if (trimmed.startsWith('### ')) {
      return (
        <h3
          key={i}
          className="text-[14px] md:text-[13px] font-semibold text-text dark:text-[#E0E0E0] mt-3 mb-1"
        >
          {trimmed.slice(4)}
        </h3>
      );
    }

    // Bullet point
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      return (
        <li key={i} className="text-[14px] md:text-[13px] text-text-secondary dark:text-[#BBB] ml-4 mb-0.5 list-disc">
          {renderInline(trimmed.slice(2))}
        </li>
      );
    }

    // Empty line
    if (trimmed === '') {
      return <div key={i} className="h-2" />;
    }

    // Regular paragraph
    return (
      <p key={i} className="text-[14px] md:text-[13px] text-text-secondary dark:text-[#BBB] leading-relaxed mb-1">
        {renderInline(trimmed)}
      </p>
    );
  });
}

/** Inline renderer for **bold** text. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-text dark:text-[#E0E0E0]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

/** Generated content output area with copy, regenerate, edit, and remix actions. */
export default function WriterOutput({
  title,
  content,
  wordCount,
  onRegenerate,
  onContentChange,
  isGenerating,
}: WriterOutputProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  }, [content]);

  const renderedContent = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div className="bento-card p-5 md:p-6 mt-6 animate-fade-in">
      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h2 className="text-[18px] md:text-[20px] font-bold text-text dark:text-white leading-tight">
          {title}
        </h2>
        <Badge
          variant="info"
          label={`${wordCount.toLocaleString()} words`}
        />
      </div>

      {/* AI provenance — Art. 50 "AI-generated" disclosure + Meta Llama attribution (Law L4).
          The writer text is produced by on-device Llama, so both apply here. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <AiGeneratedBadge />
        <BuiltWithLlama variant="inline" />
      </div>

      {/* Content body */}
      <div className="mb-5">
        {isEditing ? (
          <textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            className="w-full min-h-[240px] px-3.5 py-3 text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] placeholder:text-text-muted/40 transition-all duration-200 resize-y border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30"
          />
        ) : (
          <div className="prose-writer">{renderedContent}</div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Edit / Preview toggle */}
        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 rounded-xl text-[14px] md:text-[13px] font-medium text-text-secondary dark:text-[#AAA] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none cursor-pointer"
        >
          {isEditing ? <Eye size={15} /> : <Pencil size={15} />}
          {isEditing ? 'Preview' : 'Edit'}
        </button>

        {/* Copy */}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 rounded-xl text-[14px] md:text-[13px] font-medium text-text-secondary dark:text-[#AAA] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none cursor-pointer"
        >
          {copied ? <Check size={15} className="text-secondary" /> : <ClipboardCopy size={15} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>

        {/* Regenerate */}
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isGenerating}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 rounded-xl text-[14px] md:text-[13px] font-medium text-text-secondary dark:text-[#AAA] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw size={15} className={isGenerating ? 'animate-spin' : ''} />
          Regenerate
        </button>

        {/* Spacer */}
        <div className="hidden sm:block flex-1" />

        {/* Send to Remix Hub */}
        <a
          href="/remix"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 rounded-xl text-[14px] md:text-[13px] font-semibold bg-accent/10 text-accent hover:bg-accent/20 transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none cursor-pointer"
        >
          Send to Remix Hub
          <ArrowRight size={15} />
        </a>
      </div>
    </div>
  );
}
