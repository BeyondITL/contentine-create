'use client';

import { useState, useEffect } from 'react';
import {
  Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronUp,
  Link2, Star, AlertCircle, Megaphone,
} from 'lucide-react';
import { useScheduleStore } from '@/stores/schedule-store';
import { Button, Badge, Skeleton } from '@/components/ui';
import type { CTATemplate } from '@/types';

interface CTATemplateManagerProps {
  className?: string;
}

/** CTA Template management: list existing, create new, edit, delete with two-click pattern. */
export default function CTATemplateManager({ className = '' }: CTATemplateManagerProps) {
  const {
    ctaTemplates, fetchCTATemplates,
    createCTATemplate, updateCTATemplate, deleteCTATemplate,
  } = useScheduleStore();

  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCtaText, setFormCtaText] = useState('');
  const [formLinks, setFormLinks] = useState<{ label: string; url: string }[]>([]);
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchCTATemplates()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchCTATemplates]);

  const resetForm = () => {
    setFormName('');
    setFormCtaText('');
    setFormLinks([]);
    setFormIsDefault(false);
    setFormError('');
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (t: CTATemplate) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormCtaText(t.cta_text);
    setFormLinks(t.links ? [...t.links] : []);
    setFormIsDefault(t.is_default);
    setFormError('');
    setShowForm(true);
    setDeleteConfirmId(null);
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const handleAddLink = () => {
    setFormLinks([...formLinks, { label: '', url: '' }]);
  };

  const handleRemoveLink = (index: number) => {
    setFormLinks(formLinks.filter((_, i) => i !== index));
  };

  const handleLinkChange = (index: number, field: 'label' | 'url', value: string) => {
    setFormLinks(
      formLinks.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  const handleSubmit = async () => {
    if (!formName.trim()) {
      setFormError('Template name is required');
      return;
    }
    if (!formCtaText.trim()) {
      setFormError('CTA text is required');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const payload = {
        name: formName.trim(),
        cta_text: formCtaText.trim(),
        links: formLinks.length > 0 ? formLinks.filter((l) => l.label.trim() && l.url.trim()) : null,
        is_default: formIsDefault,
      };

      if (editingId) {
        await updateCTATemplate(editingId, payload);
      } else {
        await createCTATemplate(payload);
      }
      resetForm();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      return;
    }
    try {
      await deleteCTATemplate(id);
      setDeleteConfirmId(null);
    } catch {
      // Handled by store
    }
  };

  if (loading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <Skeleton className="h-5 w-32" />
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-text dark:text-[#E0E0E0]">
            CTA Templates
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            Reusable calls-to-action for your scheduled posts
          </p>
        </div>
        {!showForm && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={startCreate}
          >
            New Template
          </Button>
        )}
      </div>

      {/* Template list */}
      {ctaTemplates.length === 0 && !showForm && (
        <div className="flex flex-col items-center py-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/[0.06] flex items-center justify-center mb-3">
            <Megaphone className="w-6 h-6 text-primary/60" />
          </div>
          <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0] mb-1">
            No CTA templates yet
          </p>
          <p className="text-[11px] text-text-muted mb-4 max-w-[260px]">
            Create templates to add consistent calls-to-action across all your scheduled posts.
          </p>
          <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={startCreate}>
            Create First Template
          </Button>
        </div>
      )}

      {ctaTemplates.length > 0 && (
        <div className="space-y-2 mb-4">
          {ctaTemplates.map((t) => (
            <div
              key={t.id}
              className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-4 transition-all hover:border-border dark:hover:border-[#444]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] truncate">
                      {t.name}
                    </p>
                    {t.is_default && (
                      <Badge variant="info" label="Default" icon={<Star className="w-2.5 h-2.5" />} />
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
                    {t.cta_text}
                  </p>
                  {t.links && t.links.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {t.links.map((link, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 text-[10px] text-primary bg-primary/[0.06] px-2 py-0.5 rounded-md"
                        >
                          <Link2 className="w-2.5 h-2.5" />
                          {link.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className="w-10 h-10 md:w-auto md:h-auto md:p-1.5 flex items-center justify-center rounded-lg text-text-muted/50 hover:text-text dark:hover:text-white hover:bg-surface dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                    title="Edit template"
                  >
                    <Pencil className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className={`w-10 h-10 md:w-auto md:h-auto md:p-1.5 flex items-center justify-center rounded-lg transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none ${
                      deleteConfirmId === t.id
                        ? 'text-danger bg-danger/10 hover:bg-danger/20'
                        : 'text-text-muted/50 hover:text-danger hover:bg-danger/[0.06]'
                    }`}
                    title={deleteConfirmId === t.id ? 'Click again to confirm' : 'Delete template'}
                  >
                    <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  </button>
                </div>
              </div>

              {deleteConfirmId === t.id && (
                <p className="text-[10px] text-danger mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Click delete again to confirm removal
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-primary/20 dark:border-primary/30 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0]">
              {editingId ? 'Edit Template' : 'New CTA Template'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="p-1 text-text-muted/40 hover:text-text-muted transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="block text-[11px] font-medium text-text dark:text-[#E0E0E0] mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., YouTube Subscribe CTA"
              className="w-full px-3.5 py-2.5 min-h-[44px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] placeholder:text-text-muted/40 border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200"
            />
          </div>

          {/* CTA Text */}
          <div>
            <label className="block text-[11px] font-medium text-text dark:text-[#E0E0E0] mb-1">
              CTA Text
            </label>
            <textarea
              value={formCtaText}
              onChange={(e) => setFormCtaText(e.target.value)}
              placeholder="Subscribe to {{channel_name}} for more content like {{video_title}}!"
              rows={3}
              className="w-full px-3.5 py-2.5 min-h-[44px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] placeholder:text-text-muted/40 border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200 resize-none"
            />
            <p className="text-[10px] text-text-muted/50 mt-1">
              Supports placeholders: {'{{video_title}}'}, {'{{channel_name}}'}
            </p>
          </div>

          {/* Links */}
          <div>
            <label className="block text-[11px] font-medium text-text dark:text-[#E0E0E0] mb-1">
              Links (optional)
            </label>
            {formLinks.map((link, i) => (
              <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-2">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => handleLinkChange(i, 'label', e.target.value)}
                  placeholder="Label"
                  className="flex-1 px-3 py-2 min-h-[44px] md:min-h-0 text-[16px] md:text-[12px] rounded-lg bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] placeholder:text-text-muted/40 border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200"
                />
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => handleLinkChange(i, 'url', e.target.value)}
                  placeholder="https://..."
                  className="flex-[2] px-3 py-2 min-h-[44px] md:min-h-0 text-[16px] md:text-[12px] rounded-lg bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] placeholder:text-text-muted/40 border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveLink(i)}
                  className="w-10 h-10 md:w-auto md:h-auto md:p-1.5 flex items-center justify-center self-end sm:self-auto text-text-muted/40 hover:text-danger transition-colors cursor-pointer rounded-lg hover:bg-danger/[0.06] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddLink}
              className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:text-primary-hover transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-md min-h-[44px] md:min-h-0 px-2 py-1.5 md:px-1 md:py-0.5"
            >
              <Plus className="w-3 h-3" />
              Add Link
            </button>
          </div>

          {/* Default checkbox */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none min-h-[44px] md:min-h-0">
            <input
              type="checkbox"
              checked={formIsDefault}
              onChange={(e) => setFormIsDefault(e.target.checked)}
              className="w-5 h-5 md:w-4 md:h-4 rounded border-border-light dark:border-[#555] text-primary focus:ring-primary/20 cursor-pointer"
            />
            <span className="text-[12px] text-text dark:text-[#E0E0E0] font-medium">
              Set as default template
            </span>
          </label>

          {/* Error */}
          {formError && (
            <p className="flex items-center gap-1 text-[11px] text-danger">
              <AlertCircle className="w-3 h-3" />
              {formError}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={resetForm} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={editingId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              onClick={handleSubmit}
              isLoading={saving}
            >
              {editingId ? 'Save Changes' : 'Create Template'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
