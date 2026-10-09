'use client';

import { useState, useCallback } from 'react';
import {
  Link2, Youtube, Music2, FileText, Type, Trash2, Loader2,
  AlertCircle, Globe, Plus, Upload, Mic, Video,
} from 'lucide-react';
import { useRemixStore, LocalSource } from '@/stores/remix-store';
import ModelRequirements from '@/components/shared/ModelRequirements';
import type { SourceType } from '@/types';

// The five input surfaces cover all seven SourceTypes: the URL tab auto-detects
// url / youtube / tiktok, and text + pdf + audio + video are their own tabs.
type SourceTabId = 'url' | 'text' | 'pdf' | 'audio' | 'video';

const SOURCE_TABS: { id: SourceTabId; label: string; icon: typeof Link2 }[] = [
  { id: 'url', label: 'URL / Link', icon: Link2 },
  { id: 'text', label: 'Paste Text', icon: Type },
  { id: 'pdf', label: 'PDF', icon: FileText },
  { id: 'audio', label: 'Audio', icon: Mic },
  { id: 'video', label: 'Video', icon: Video },
];

/** Detects source type from a URL string. */
function detectSourceType(url: string): SourceType {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('tiktok.com')) return 'tiktok';
  return 'url';
}

/** Icon for a source type. */
function SourceTypeIcon({ type }: { type: SourceType }) {
  switch (type) {
    case 'youtube': return <Youtube size={14} className="text-red-500" />;
    case 'tiktok': return <Music2 size={14} className="text-pink-500" />;
    case 'pdf': return <FileText size={14} className="text-orange-500" />;
    case 'audio': return <Mic size={14} className="text-violet-500" />;
    case 'video': return <Video size={14} className="text-indigo-500" />;
    case 'text': return <Type size={14} className="text-primary" />;
    default: return <Globe size={14} className="text-primary" />;
  }
}

/** Step 1 — Add sources to the remix project. */
export default function SourcePanel() {
  const {
    localSources, isExtracting, extractionError,
    isTranscribing, transcribeProgress,
    addTextSource, addUrlSource, transcribeSource, removeSource,
  } = useRemixStore();
  const [activeTab, setActiveTab] = useState<SourceTabId>('url');
  const [urlInput, setUrlInput] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textInput, setTextInput] = useState('');

  const maxSources = 10;
  const canAdd = localSources.length < maxSources;

  const handleAddUrl = useCallback(async () => {
    if (!urlInput.trim() || !canAdd) return;
    const type = detectSourceType(urlInput.trim());
    try {
      await addUrlSource(type, urlInput.trim());
      setUrlInput('');
    } catch {
      // Error is set in store
    }
  }, [urlInput, canAdd, addUrlSource]);

  const handleAddText = useCallback(() => {
    if (!textInput.trim() || !canAdd) return;
    addTextSource(textTitle.trim() || 'Pasted Text', textInput.trim());
    setTextTitle('');
    setTextInput('');
  }, [textTitle, textInput, canAdd, addTextSource]);

  const handlePdfUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canAdd) return;

    // PDF extraction happens browser-side using pdfjs-dist
    try {
      const { extractPdfText } = await import('@/lib/pdf-extract');
      const text = await extractPdfText(file);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      if (wordCount < 5) {
        useRemixStore.setState({ extractionError: 'PDF appears to be empty or image-only. Try a text-based PDF.' });
        return;
      }
      addTextSource(file.name.replace('.pdf', ''), text);
    } catch {
      useRemixStore.setState({ extractionError: 'Failed to parse PDF. Ensure it contains selectable text.' });
    }

    // Reset file input
    e.target.value = '';
  }, [canAdd, addTextSource]);

  /** Transcribe an uploaded audio/video file on-device (real Whisper — no facade). */
  const handleMediaUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'video') => {
    const file = e.target.files?.[0];
    if (!file || !canAdd) return;
    try {
      await transcribeSource(file, type);
    } catch {
      // Error is set in store
    }
    e.target.value = '';
  }, [canAdd, transcribeSource]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (text && activeTab === 'url') {
      const type = detectSourceType(text);
      if (type !== 'url' || text.startsWith('http')) {
        setUrlInput(text);
      }
    }
  }, [activeTab]);

  const totalWords = localSources.reduce((sum, s) => sum + s.wordCount, 0);

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 flex items-start gap-2">
        <FileText size={14} className="text-accent mt-0.5 shrink-0" />
        <p className="text-xs text-muted leading-relaxed">
          Add up to 10 content sources — articles, YouTube or TikTok links, PDFs, audio, or video.
          Contentine Create extracts the text and uses it to generate platform-specific posts, articles, and video scripts.
        </p>
      </div>

      {/* Input tabs */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
        <div className="flex border-b border-border-light dark:border-[#333]">
          {SOURCE_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 min-h-[44px] text-xs font-medium transition-colors ${
                activeTab === id
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-muted hover:text-text dark:hover:text-white'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* URL input */}
          {activeTab === 'url' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                  placeholder="Paste a URL — article, YouTube video, or TikTok..."
                  disabled={!canAdd || isExtracting}
                  className="flex-1 bg-surface dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2.5 text-[16px] sm:text-sm min-h-[44px] text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleAddUrl}
                  disabled={!urlInput.trim() || !canAdd || isExtracting}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {isExtracting ? 'Extracting...' : 'Add'}
                </button>
              </div>
              <p className="text-[11px] text-muted">
                Supports articles, blog posts, YouTube videos (with captions), and TikTok posts
              </p>
            </div>
          )}

          {/* Text paste */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              <input
                type="text"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="Source title (optional)"
                className="w-full bg-surface dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2.5 text-[16px] sm:text-sm min-h-[44px] text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                rows={6}
                placeholder="Paste your content here — blog post, notes, transcript, script, anything..."
                className="w-full bg-surface dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2.5 text-[16px] sm:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted">
                  {textInput.trim().split(/\s+/).filter(Boolean).length} words
                </span>
                <button
                  type="button"
                  onClick={handleAddText}
                  disabled={!textInput.trim() || !canAdd}
                  className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={14} />
                  Add Source
                </button>
              </div>
            </div>
          )}

          {/* PDF upload */}
          {activeTab === 'pdf' && (
            <div className="space-y-3">
              <label
                className={`flex flex-col items-center justify-center py-6 px-4 md:py-8 min-h-[120px] border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
                  canAdd
                    ? 'border-border dark:border-[#444] hover:border-primary dark:hover:border-primary active:border-primary'
                    : 'border-border-light dark:border-[#333] opacity-50 cursor-not-allowed'
                }`}
              >
                <Upload size={24} className="text-muted mb-2" />
                <p className="text-sm font-medium text-text dark:text-white text-center">
                  Drop a PDF here or tap to browse
                </p>
                <p className="text-[11px] text-muted mt-1 text-center">Text-based PDFs only — scanned images won&apos;t work</p>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handlePdfUpload}
                  disabled={!canAdd}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Audio transcription (on-device Whisper) */}
          {activeTab === 'audio' && (
            <MediaTranscribeTab
              type="audio"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac"
              icon={<Mic size={24} className="text-muted mb-2" />}
              headline="Upload an audio file to transcribe"
              formatsHint="MP3, WAV, M4A, OGG supported — transcribed on your device"
              canAdd={canAdd}
              isTranscribing={isTranscribing}
              progress={transcribeProgress}
              onUpload={(e) => handleMediaUpload(e, 'audio')}
            />
          )}

          {/* Video transcription (on-device Whisper on the audio track) */}
          {activeTab === 'video' && (
            <MediaTranscribeTab
              type="video"
              accept="video/*,.mp4,.mov,.webm,.mkv,.m4v"
              icon={<Video size={24} className="text-muted mb-2" />}
              headline="Upload a video file to transcribe"
              formatsHint="MP4, MOV, WebM supported — the spoken audio is transcribed on your device"
              canAdd={canAdd}
              isTranscribing={isTranscribing}
              progress={transcribeProgress}
              onUpload={(e) => handleMediaUpload(e, 'video')}
            />
          )}
        </div>
      </div>

      {/* Extraction / transcription error */}
      {extractionError && (
        <div className="p-3 bg-danger/5 border border-danger/20 rounded-lg flex items-start gap-2">
          <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
          <p className="text-xs text-danger">{extractionError}</p>
        </div>
      )}

      {/* Source cards */}
      {localSources.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
              Sources ({localSources.length}/{maxSources})
            </h3>
            <span className="text-[11px] text-muted">{totalWords.toLocaleString()} total words</span>
          </div>

          {localSources.map((source) => (
            <SourceCard key={source.id} source={source} onRemove={() => removeSource(source.id)} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {localSources.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-3">
            <FileText size={24} className="text-accent" />
          </div>
          <h3 className="text-sm font-semibold text-text dark:text-white mb-1">No sources added yet</h3>
          <p className="text-xs text-muted max-w-xs">
            Add articles, videos, PDFs, or paste text to get started. Your content will be transformed into posts for every platform.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Audio/Video tab body. Real on-device transcription: the upload control is
 * gated behind the `captions` model manifest (Whisper). Until the model is
 * downloaded, ModelRequirements renders its honest one-click download banner;
 * once ready it renders the dropzone, and a picked file is transcribed for real.
 */
function MediaTranscribeTab({
  type, accept, icon, headline, formatsHint, canAdd, isTranscribing, progress, onUpload,
}: {
  type: 'audio' | 'video';
  accept: string;
  icon: React.ReactNode;
  headline: string;
  formatsHint: string;
  canAdd: boolean;
  isTranscribing: boolean;
  progress: number;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const pct = Math.round(progress * 100);
  return (
    <div className="space-y-3">
      <ModelRequirements
        feature="captions"
        title="Download the transcription model"
        description={`${type === 'video' ? 'Video' : 'Audio'} is transcribed on your device. The Whisper model below downloads once, then works offline.`}
      >
        {isTranscribing ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 min-h-[120px] border-2 border-dashed border-primary/40 rounded-xl">
            <Loader2 size={24} className="text-primary animate-spin mb-3" />
            <p className="text-sm font-medium text-text dark:text-white text-center">
              Transcribing {type}…
            </p>
            {pct > 0 && pct < 100 && (
              <div className="w-full max-w-[220px] mt-3">
                <div className="w-full h-2 bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted mt-1 tabular-nums text-center">{pct}%</p>
              </div>
            )}
            <p className="text-[11px] text-muted mt-2 text-center">Running on your device — this can take a moment for longer files.</p>
          </div>
        ) : (
          <label
            className={`flex flex-col items-center justify-center py-6 px-4 md:py-8 min-h-[120px] border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
              canAdd
                ? 'border-border dark:border-[#444] hover:border-primary dark:hover:border-primary active:border-primary'
                : 'border-border-light dark:border-[#333] opacity-50 cursor-not-allowed'
            }`}
          >
            {icon}
            <p className="text-sm font-medium text-text dark:text-white text-center">{headline}</p>
            <p className="text-[11px] text-muted mt-1 text-center">{formatsHint}</p>
            <input
              type="file"
              accept={accept}
              onChange={onUpload}
              disabled={!canAdd || isTranscribing}
              className="hidden"
            />
          </label>
        )}
      </ModelRequirements>
    </div>
  );
}

/** Individual source card. */
function SourceCard({ source, onRemove }: { source: LocalSource; onRemove: () => void }) {
  const preview = source.text.slice(0, 120) + (source.text.length > 120 ? '...' : '');

  return (
    <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-3 flex items-start gap-3 group">
      <div className="w-8 h-8 rounded-lg bg-surface dark:bg-[#2a2a2a] flex items-center justify-center shrink-0 mt-0.5">
        <SourceTypeIcon type={source.type} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text dark:text-white truncate">{source.title}</p>
          <span className="text-[10px] font-medium text-muted bg-surface dark:bg-[#2a2a2a] px-1.5 py-0.5 rounded capitalize shrink-0">
            {source.type}
          </span>
        </div>
        <p className="text-[11px] text-muted mt-0.5 line-clamp-2">{preview}</p>
        <span className="text-[10px] text-muted mt-1 block">{source.wordCount.toLocaleString()} words</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
        aria-label={`Remove ${source.title}`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
