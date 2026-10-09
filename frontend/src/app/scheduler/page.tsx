'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Upload, Download, FileSpreadsheet, Calendar, ArrowLeft,
  CheckCircle2, AlertTriangle, AlertCircle, Search,
} from 'lucide-react';
import Papa from 'papaparse';
import Link from 'next/link';
import { useScheduleStore } from '@/stores/schedule-store';
import { useVideoStore } from '@/stores/video-store';
import { useToast } from '@/components/ui/Toast';
import { Button, Badge, Skeleton, EmptyState } from '@/components/ui';
import BulkUploadModal from '@/components/scheduler/BulkUploadModal';
import type { Platform, BulkScheduleRow } from '@/types';

const VALID_PLATFORMS: Platform[] = ['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'threads', 'twitter'];
const CSV_COLUMNS = ['video_id', 'platform', 'scheduled_at', 'title', 'description', 'tags', 'hashtags'];

interface ValidatedRow extends BulkScheduleRow {
  _rowIndex: number;
  _errors: string[];
  _isValid: boolean;
  _videoTitle: string;
}

/** Bulk Scheduler page skeleton. */
function BulkSchedulerSkeleton() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl mb-6" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/** Bulk Scheduler page for uploading CSV files to schedule posts in bulk. */
export default function BulkSchedulerPage() {
  const { socialAccounts, fetchSocialAccounts, bulkSchedule } = useScheduleStore();
  const { videos, fetchVideos } = useVideoStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [parseError, setParseError] = useState('');

  // Build lookup maps
  const videoMap = useMemo(() => {
    const map = new Map<number, string>();
    (videos ?? []).forEach((v) => map.set(v.id, v.title));
    return map;
  }, [videos]);

  const connectedPlatforms = useMemo(
    () => new Set((socialAccounts ?? []).map((a) => a.platform)),
    [socialAccounts]
  );

  useEffect(() => {
    document.title = 'Bulk Scheduler \u2014 Contentine Create';
  }, []);

  useEffect(() => {
    Promise.all([
      fetchVideos().catch(() => {}),
      fetchSocialAccounts().catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const validateRow = useCallback(
    (raw: Record<string, string>, index: number): ValidatedRow => {
      const errors: string[] = [];

      const videoId = parseInt(raw.video_id, 10);
      if (!videoId || isNaN(videoId)) {
        errors.push('Invalid video_id');
      } else if (!videoMap.has(videoId)) {
        errors.push('Video not found');
      }

      const platform = (raw.platform || '').toLowerCase().trim() as Platform;
      if (!VALID_PLATFORMS.includes(platform)) {
        errors.push(`Invalid platform "${raw.platform}"`);
      } else if (!connectedPlatforms.has(platform)) {
        errors.push('Platform not connected');
      }

      const scheduledAt = raw.scheduled_at || '';
      const scheduledDate = new Date(scheduledAt);
      if (!scheduledAt || isNaN(scheduledDate.getTime())) {
        errors.push('Invalid date format');
      } else if (scheduledDate <= new Date()) {
        errors.push('Date in past');
      }

      const title = (raw.title || '').trim();
      const description = (raw.description || '').trim();

      const tags = (raw.tags || '')
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean);

      const hashtags = (raw.hashtags || '')
        .split(',')
        .map((h: string) => {
          const cleaned = h.trim().replace(/^#/, '');
          return cleaned ? `#${cleaned}` : '';
        })
        .filter(Boolean);

      return {
        video_id: videoId || 0,
        platform,
        scheduled_at: scheduledAt,
        title,
        description,
        tags,
        hashtags,
        _rowIndex: index + 1,
        _errors: errors,
        _isValid: errors.length === 0,
        _videoTitle: videoMap.get(videoId) || 'Unknown video',
      };
    },
    [videoMap, connectedPlatforms]
  );

  const parseCSV = useCallback(
    (file: File) => {
      setParseError('');

      if (!file.name.endsWith('.csv')) {
        setParseError('Only .csv files are supported');
        return;
      }

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            setParseError(`CSV parse error: ${results.errors[0].message}`);
            return;
          }

          if (!results.data || results.data.length === 0) {
            setParseError('CSV file is empty or has no data rows');
            return;
          }

          const validated = (results.data as Record<string, string>[]).map((row, i) =>
            validateRow(row, i)
          );

          setRows(validated);
        },
        error: (err) => {
          setParseError(`Failed to read CSV: ${err.message}`);
        },
      });
    },
    [validateRow]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) parseCSV(file);
    },
    [parseCSV]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseCSV(file);
    // Reset so same file can be re-uploaded
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const header = CSV_COLUMNS.join(',');
    const exampleRow = '1,youtube,2026-03-15T10:00:00,My Video Title,A great description,"tag1,tag2","#content,#ai"';
    const csv = `${header}\n${exampleRow}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contentine-bulk-schedule-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleScheduleAll = async () => {
    const validRows = rows.filter((r) => r._isValid).map(({ _rowIndex, _errors, _isValid, _videoTitle, ...row }) => row);
    if (validRows.length === 0) return;

    setScheduling(true);
    try {
      await bulkSchedule(validRows);
      toast({
        variant: 'success',
        title: 'Posts scheduled',
        description: `${validRows.length} post${validRows.length !== 1 ? 's' : ''} have been scheduled successfully.`,
      });
      setRows([]);
    } catch {
      toast({
        variant: 'error',
        title: 'Scheduling failed',
        description: 'Some posts could not be scheduled. Please try again.',
      });
    } finally {
      setScheduling(false);
    }
  };

  const handleModalUpload = async (modalRows: BulkScheduleRow[]) => {
    await bulkSchedule(modalRows);
    toast({
      variant: 'success',
      title: 'Posts scheduled',
      description: `${modalRows.length} post${modalRows.length !== 1 ? 's' : ''} have been scheduled.`,
    });
  };

  const validCount = rows.filter((r) => r._isValid).length;
  const invalidCount = rows.filter((r) => !r._isValid).length;

  if (loading) {
    return (
      <div className="p-5 lg:p-6">
        <BulkSchedulerSkeleton />
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Upload className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-text dark:text-white tracking-[-0.02em]">
              Bulk Scheduler
            </h1>
          </div>
          <p className="text-sm text-muted">
            Upload a CSV to schedule posts in bulk
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/calendar"
            className="flex items-center gap-2 px-3 py-2 min-h-[44px] md:min-h-0 rounded-xl text-[12px] font-medium text-text-muted hover:text-text dark:hover:text-white bg-surface dark:bg-[#252525] hover:bg-border-light dark:hover:bg-[#333] transition-all focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            <Calendar className="w-3.5 h-3.5" />
            Calendar View
          </Link>
          <Button
            variant="secondary"
            size="sm"
            icon={<Upload className="w-3.5 h-3.5" />}
            onClick={() => setShowModal(true)}
          >
            Upload via Modal
          </Button>
        </div>
      </div>

      {/* Upload section */}
      <div className="mb-8">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`
            relative rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200
            ${dragActive
              ? 'border-primary bg-primary/[0.04] dark:bg-primary/[0.08]'
              : 'border-border-light dark:border-[#333] hover:border-primary/40'
            }
          `}
        >
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors ${
            dragActive ? 'bg-primary/10' : 'bg-surface dark:bg-[#252525]'
          }`}>
            <FileSpreadsheet className={`w-7 h-7 ${dragActive ? 'text-primary' : 'text-text-muted/50'}`} />
          </div>

          <p className="text-[14px] font-semibold text-text dark:text-[#E0E0E0] mb-1">
            Drag and drop your CSV file here
          </p>
          <p className="text-[12px] text-text-muted mb-4">
            or select a file from your computer
          </p>

          <div className="flex items-center justify-center gap-3">
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] text-[12.5px] font-semibold hover:bg-[#1A1A1A] dark:hover:bg-[#E8E8E8] active:scale-[0.97] transition-all duration-200 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.15),0_0_0_0.5px_rgba(0,0,0,0.08)]">
              <Upload className="w-4 h-4" />
              Choose CSV File
              <input
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-2 text-[12px] font-medium text-primary hover:text-primary-hover transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-md min-h-[44px] md:min-h-0 px-3 py-2 md:px-2 md:py-1"
            >
              <Download className="w-3.5 h-3.5" />
              Download template
            </button>
          </div>

          <p className="text-[10px] text-text-muted/50 mt-4">
            Expected columns: {CSV_COLUMNS.join(', ')}
          </p>
        </div>

        {parseError && (
          <div className="flex items-center gap-2 px-4 py-3 mt-3 rounded-xl bg-danger/[0.06] border border-danger/10">
            <AlertCircle className="w-4 h-4 text-danger shrink-0" />
            <p className="text-[12px] text-danger">{parseError}</p>
          </div>
        )}
      </div>

      {/* Parsed results */}
      {rows.length > 0 && (
        <div>
          {/* Summary bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-[15px] font-semibold text-text dark:text-[#E0E0E0]">
                Preview ({rows.length} rows)
              </h2>
              {validCount > 0 && (
                <Badge
                  variant="success"
                  label={`${validCount} valid`}
                  icon={<CheckCircle2 className="w-3 h-3" />}
                />
              )}
              {invalidCount > 0 && (
                <Badge
                  variant="danger"
                  label={`${invalidCount} invalid`}
                  icon={<AlertTriangle className="w-3 h-3" />}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRows([])}
              >
                Clear
              </Button>
              <Button
                variant="primary"
                size="md"
                icon={<Upload className="w-4 h-4" />}
                onClick={handleScheduleAll}
                isLoading={scheduling}
                disabled={validCount === 0}
                className="!bg-gradient-to-r !from-primary !via-accent !to-secondary !text-white !shadow-lg !shadow-accent/20"
              >
                Schedule All Valid ({validCount})
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-surface dark:bg-[#1a1a1a] border-b border-border-light dark:border-[#333]">
                    <th className="text-left px-4 py-3 font-semibold text-text-muted text-[11px]">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-text-muted text-[11px]">Video</th>
                    <th className="text-left px-4 py-3 font-semibold text-text-muted text-[11px]">Platform</th>
                    <th className="text-left px-4 py-3 font-semibold text-text-muted text-[11px]">Scheduled At</th>
                    <th className="text-left px-4 py-3 font-semibold text-text-muted text-[11px]">Title</th>
                    <th className="text-left px-4 py-3 font-semibold text-text-muted text-[11px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row._rowIndex}
                      className={`border-b border-border-light dark:border-[#333] last:border-b-0 transition-colors ${
                        !row._isValid ? 'bg-danger/[0.02]' : 'hover:bg-surface/50 dark:hover:bg-[#1a1a1a]'
                      }`}
                    >
                      <td className="px-4 py-3 text-text-muted font-mono">{row._rowIndex}</td>
                      <td className="px-4 py-3 text-text dark:text-[#E0E0E0]">
                        <div className="max-w-[160px]">
                          <p className="truncate font-medium">{row._videoTitle}</p>
                          <p className="text-[10px] text-text-muted font-mono">ID: {row.video_id}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface dark:bg-[#252525] text-[11px] font-medium text-text dark:text-[#E0E0E0] capitalize">
                          {row.platform || '---'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text dark:text-[#E0E0E0] whitespace-nowrap">
                        {row.scheduled_at && !isNaN(new Date(row.scheduled_at).getTime())
                          ? new Date(row.scheduled_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : <span className="text-text-muted">Invalid date</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-text dark:text-[#E0E0E0]">
                        <span className="truncate block max-w-[160px]">
                          {row.title || <span className="text-text-muted italic">No title</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row._isValid ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-secondary">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Valid
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-danger">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Invalid
                            </span>
                            <p className="text-[10px] text-danger/70 mt-0.5">
                              {row._errors.join(', ')}
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {invalidCount > 0 && (
            <p className="text-[11px] text-text-muted mt-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              {invalidCount} row{invalidCount !== 1 ? 's' : ''} will be skipped. Only valid rows will be scheduled.
            </p>
          )}
        </div>
      )}

      {/* Empty state (no rows parsed yet) */}
      {rows.length === 0 && !parseError && (
        <div className="mt-4">
          <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/[0.06] flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6 text-primary/60" />
            </div>
            <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0] mb-1">
              No data to preview
            </p>
            <p className="text-[11px] text-text-muted max-w-[300px] mx-auto">
              Upload a CSV file above to preview and validate your bulk schedule before submitting.
            </p>
          </div>
        </div>
      )}

      {/* Bulk upload modal (alternative flow) */}
      <BulkUploadModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onUpload={handleModalUpload}
      />
    </div>
  );
}
