'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Sparkles, Loader2, ChevronDown, ChevronUp, AlertCircle, RotateCcw,
} from 'lucide-react';
import { useWriterStore } from '@/stores/writer-store';
import ContentTypeSelector from '@/components/writer/ContentTypeSelector';
import WriterOutput from '@/components/writer/WriterOutput';
import DocumentHistory from '@/components/writer/DocumentHistory';
import WriterSkeleton from '@/components/writer/WriterSkeleton';
import ModelRequirements from '@/components/shared/ModelRequirements';
import type { WriterTone, WriterLength } from '@/types';

const TONE_OPTIONS: { value: WriterTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'witty', label: 'Witty' },
  { value: 'formal', label: 'Formal' },
  { value: 'inspirational', label: 'Inspirational' },
];

const LENGTH_OPTIONS: { value: WriterLength; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
];

/** AI Writer page — generate professional content for any purpose. */
export default function WriterPage() {
  const [ready, setReady] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const {
    docType, setDocType,
    topic, setTopic,
    tone, setTone,
    length, setLength,
    additionalInstructions, setAdditionalInstructions,
    isGenerating, generatedTitle, generatedContent, wordCount, generateError,
    generationSource, modelProgress,
    generate, fetchDocuments,
    documents, isLoadingDocs, activeDoc,
    loadDocument, deleteDocument,
  } = useWriterStore();

  // Set page title and fetch documents on mount
  useEffect(() => {
    document.title = 'AI Writer \u2014 Contentine Create';
    fetchDocuments();
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || isGenerating) return;
    await generate();
  }, [topic, isGenerating, generate]);

  const handleContentChange = useCallback((newContent: string) => {
    // Update content locally in the store state
    useWriterStore.setState({
      generatedContent: newContent,
      wordCount: newContent.split(/\s+/).filter(Boolean).length,
    });
  }, []);

  // Show skeleton until hydrated
  if (!ready) {
    return <WriterSkeleton />;
  }

  const hasOutput = generatedContent.length > 0;

  return (
    <div className="max-w-[1280px] mx-auto px-4 md:px-0">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={20} className="text-accent" />
          <h1 className="text-xl md:text-2xl font-bold text-text dark:text-white">
            AI Writer
          </h1>
        </div>
        <p className="text-sm text-text-muted">
          Generate professional content for any purpose — powered by AI
        </p>
      </div>

      {/* On-device model gate — informs + offers download; server fallback keeps the page usable */}
      <div className="mb-6">
        <ModelRequirements
          feature="writer"
          description="AI Writer drafts on your device. The model below downloads once, then works offline."
        />
      </div>

      {/* Main layout: content + sidebar */}
      <div className="flex gap-6">
        {/* Left panel — main form and output */}
        <div className="flex-1 min-w-0">
          {/* Content type selector */}
          <div className="mb-5">
            <label className="block text-[12px] font-semibold text-text dark:text-[#E0E0E0] mb-2.5">
              Content Type
            </label>
            <ContentTypeSelector selected={docType} onSelect={setDocType} />
          </div>

          {/* Topic textarea */}
          <div className="mb-4">
            <label className="block text-[12px] font-semibold text-text dark:text-[#E0E0E0] mb-1.5">
              Topic
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What should we write about?"
              rows={3}
              className="w-full px-3.5 py-3 min-h-[88px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] placeholder:text-text-muted/40 transition-all duration-200 resize-none border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30"
            />
          </div>

          {/* Settings row */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            {/* Tone */}
            <div className="flex-1 sm:max-w-[200px]">
              <label className="block text-[12px] font-semibold text-text dark:text-[#E0E0E0] mb-1.5">
                Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as WriterTone)}
                className="w-full px-3.5 py-3 min-h-[44px] md:min-h-0 md:py-2.5 text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200 cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B949E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: '36px',
                }}
              >
                {TONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Length */}
            <div className="flex-1 sm:max-w-[200px]">
              <label className="block text-[12px] font-semibold text-text dark:text-[#E0E0E0] mb-1.5">
                Length
              </label>
              <select
                value={length}
                onChange={(e) => setLength(e.target.value as WriterLength)}
                className="w-full px-3.5 py-3 min-h-[44px] md:min-h-0 md:py-2.5 text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200 cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B949E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: '36px',
                }}
              >
                {LENGTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Additional instructions (collapsible) */}
          <div className="mb-5">
            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-secondary dark:text-[#AAA] hover:text-text dark:hover:text-white transition-colors cursor-pointer min-h-[44px] md:min-h-0 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-lg px-1"
            >
              {showInstructions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showInstructions ? 'Hide instructions' : 'Add instructions'}
            </button>
            {showInstructions && (
              <div className="mt-2 animate-fade-in">
                <textarea
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="Any specific style, audience, or requirements for the content..."
                  rows={3}
                  className="w-full px-3.5 py-3 min-h-[88px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] placeholder:text-text-muted/40 transition-all duration-200 resize-none border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30"
                />
              </div>
            )}
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!topic.trim() || isGenerating}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] rounded-xl text-[14px] md:text-[13px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none cursor-pointer bg-gradient-to-r from-accent via-[#D98BFF] to-accent shadow-lg shadow-accent/20 hover:shadow-accent/30 hover:opacity-95"
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>&#10022; Generate Content</span>
              </>
            )}
          </button>

          {/* Error state */}
          {generateError && (
            <div className="mt-4 p-4 rounded-xl bg-danger/[0.06] border border-danger/20 animate-fade-in">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-danger mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[13px] font-medium text-danger mb-1">
                    Generation failed
                  </p>
                  <p className="text-[12px] text-text-muted mb-3">
                    {generateError}
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-[12px] font-medium text-danger hover:bg-danger/[0.06] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                  >
                    <RotateCcw size={12} />
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Generating indicator in output area */}
          {isGenerating && !hasOutput && (
            <div className="bento-card p-6 md:p-8 mt-6 flex flex-col items-center justify-center text-center animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-accent/[0.06] flex items-center justify-center mb-4">
                <Loader2 size={20} className="text-accent animate-spin" />
              </div>
              {modelProgress ? (
                <>
                  <p className="text-[14px] font-medium text-text dark:text-white mb-2">
                    {modelProgress.progress < 1 ? 'Downloading AI model...' : 'Generating content...'}
                  </p>
                  {modelProgress.progress < 1 && (
                    <div className="w-full max-w-[300px] mb-2">
                      <div className="h-2 bg-black/[0.04] dark:bg-white/[0.08] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all duration-300"
                          style={{ width: `${Math.round(modelProgress.progress * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-text-muted mt-1">{Math.round(modelProgress.progress * 100)}% — {modelProgress.text}</p>
                    </div>
                  )}
                  <p className="text-[11px] text-text-muted">
                    {modelProgress.progress < 1 ? 'One-time download — cached for future use' : 'Streaming response from browser-native AI'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[14px] font-medium text-text dark:text-white mb-1">
                    Crafting your content...
                  </p>
                  <p className="text-[12px] text-text-muted">
                    This usually takes a few seconds
                  </p>
                </>
              )}
            </div>
          )}

          {/* Show streaming output while generating */}
          {isGenerating && hasOutput && (
            <WriterOutput
              title={generatedTitle || topic}
              content={generatedContent}
              wordCount={wordCount}
              onRegenerate={handleGenerate}
              onContentChange={handleContentChange}
              isGenerating={isGenerating}
            />
          )}

          {/* Generated output — final */}
          {hasOutput && !isGenerating && (
            <WriterOutput
              title={generatedTitle}
              content={generatedContent}
              wordCount={wordCount}
              onRegenerate={handleGenerate}
              onContentChange={handleContentChange}
              isGenerating={isGenerating}
            />
          )}
        </div>

        {/* Right sidebar — document history (desktop only) */}
        <aside className="hidden lg:block w-[300px] shrink-0">
          <div className="sticky top-6">
            <DocumentHistory
              documents={documents}
              isLoading={isLoadingDocs}
              activeDocId={activeDoc?.id ?? null}
              onLoad={loadDocument}
              onDelete={deleteDocument}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
