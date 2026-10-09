'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, AlertTriangle, CheckCircle2,
  X, Download, AlertCircle,
} from 'lucide-react';
import Papa from 'papaparse';
import { Modal, Button, Badge } from '@/components/ui';
import type { Platform, BulkScheduleRow } from '@/types';

const VALID_PLATFORMS: Platform[] = ['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'threads', 'twitter'];
const CSV_COLUMNS = ['video_id', 'platform', 'scheduled_at', 'title', 'description', 'tags', 'hashtags'];

interface ParsedRow extends BulkScheduleRow {
  _rowIndex: number;
  _errors: string[];
  _isValid: boolean;
}

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (rows: BulkScheduleRow[]) => Promise<void>;
}

/** Modal for CSV bulk upload: drag-drop, parse preview, validation, and submit. */
export default function BulkUploadModal({ isOpen, onClose, onUpload }: BulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validCount = parsedRows.filter((r) => r._isValid).length;
  const invalidCount = parsedRows.filter((r) => !r._isValid).length;

  const resetState = () => {
    setFile(null);
    setParsedRows([]);
    setParseError('');
    setUploading(false);
    setDragActive(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const validateRow = (row: Record<string, string>, index: number): ParsedRow => {
    const errors: string[] = [];

    const videoId = parseInt(row.video_id, 10);
    if (!videoId || isNaN(videoId)) errors.push('Invalid video_id');

    const platform = (row.platform || '').toLowerCase().trim() as Platform;
    if (!VALID_PLATFORMS.includes(platform)) errors.push(`Invalid platform "${row.platform}"`);

    const scheduledAt = row.scheduled_at || '';
    const scheduledDate = new Date(scheduledAt);
    if (!scheduledAt || isNaN(scheduledDate.getTime())) {
      errors.push('Invalid date format');
    } else if (scheduledDate <= new Date()) {
      errors.push('Date is in the past');
    }

    const title = (row.title || '').trim();
    const description = (row.description || '').trim();

    // Parse tags and hashtags from comma-separated strings
    const tags = (row.tags || '')
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);

    const hashtags = (row.hashtags || '')
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
    };
  };

  const parseCSV = useCallback((csvFile: File) => {
    setParseError('');

    if (!csvFile.name.endsWith('.csv')) {
      setParseError('Only .csv files are supported');
      return;
    }

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setParseError(`CSV parse error: ${results.errors[0].message}`);
          return;
        }

        if (!results.data || results.data.length === 0) {
          setParseError('CSV file is empty');
          return;
        }

        const rows = (results.data as Record<string, string>[]).map((row, i) =>
          validateRow(row, i)
        );

        setParsedRows(rows);
        setFile(csvFile);
      },
      error: (err) => {
        setParseError(`Failed to read CSV: ${err.message}`);
      },
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) parseCSV(droppedFile);
    },
    [parseCSV]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) parseCSV(selectedFile);
  };

  const handleUpload = async () => {
    const validRows = parsedRows.filter((r) => r._isValid).map(({ _rowIndex, _errors, _isValid, ...row }) => row);
    if (validRows.length === 0) return;

    setUploading(true);
    try {
      await onUpload(validRows);
      handleClose();
    } catch {
      setParseError('Failed to schedule posts. Please try again.');
    } finally {
      setUploading(false);
    }
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

  // Preview rows — show first 5
  const previewRows = parsedRows.slice(0, 5);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Upload CSV" size="lg">
      {/* If no file yet, show drop zone */}
      {!file && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`
              flex flex-col items-center justify-center py-12 px-6 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200
              ${dragActive
                ? 'border-primary bg-primary/[0.04] dark:bg-primary/[0.08]'
                : 'border-border-light dark:border-[#333] hover:border-primary/40 hover:bg-surface/50 dark:hover:bg-[#1a1a1a]'
              }
            `}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
              dragActive ? 'bg-primary/10' : 'bg-surface dark:bg-[#252525]'
            }`}>
              <Upload className={`w-6 h-6 ${dragActive ? 'text-primary' : 'text-text-muted/50'}`} />
            </div>
            <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0] mb-1">
              Drop your CSV file here
            </p>
            <p className="text-[11px] text-text-muted">
              or <span className="text-primary font-medium">click to browse</span>
            </p>
            <p className="text-[10px] text-text-muted/50 mt-2">
              Only .csv files supported
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Download template link */}
          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-2 text-[12px] font-medium text-primary hover:text-primary-hover transition-colors cursor-pointer mx-auto focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-md min-h-[44px] md:min-h-0 px-3 py-2 md:px-2 md:py-1"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV template
          </button>

          {parseError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger/[0.06] border border-danger/10">
              <AlertCircle className="w-4 h-4 text-danger shrink-0" />
              <p className="text-[12px] text-danger">{parseError}</p>
            </div>
          )}
        </div>
      )}

      {/* Parsed results preview */}
      {file && parsedRows.length > 0 && (
        <div className="space-y-4">
          {/* File summary */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-secondary" />
              <span className="text-[13px] font-medium text-text dark:text-[#E0E0E0]">
                {file.name}
              </span>
              <span className="text-[11px] text-text-muted">
                ({parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''})
              </span>
            </div>
            <button
              type="button"
              onClick={resetState}
              className="text-[11px] text-text-muted hover:text-text dark:hover:text-white transition-colors cursor-pointer min-h-[44px] md:min-h-0 px-2 py-1 rounded-lg"
            >
              Choose different file
            </button>
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-3">
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

          {/* Preview table */}
          <div className="rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-surface dark:bg-[#1a1a1a]">
                    <th className="text-left px-3 py-2 font-medium text-text-muted">#</th>
                    <th className="text-left px-3 py-2 font-medium text-text-muted">Platform</th>
                    <th className="text-left px-3 py-2 font-medium text-text-muted">Video ID</th>
                    <th className="text-left px-3 py-2 font-medium text-text-muted">Scheduled</th>
                    <th className="text-left px-3 py-2 font-medium text-text-muted">Title</th>
                    <th className="text-left px-3 py-2 font-medium text-text-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr
                      key={row._rowIndex}
                      className={`border-t border-border-light dark:border-[#333] ${
                        !row._isValid ? 'bg-danger/[0.03]' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-text-muted">{row._rowIndex}</td>
                      <td className="px-3 py-2 text-text dark:text-[#E0E0E0] capitalize">
                        {row.platform || '---'}
                      </td>
                      <td className="px-3 py-2 text-text dark:text-[#E0E0E0] font-mono">
                        {row.video_id || '---'}
                      </td>
                      <td className="px-3 py-2 text-text dark:text-[#E0E0E0] whitespace-nowrap">
                        {row.scheduled_at
                          ? new Date(row.scheduled_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : '---'}
                      </td>
                      <td className="px-3 py-2 text-text dark:text-[#E0E0E0] truncate max-w-[120px]">
                        {row.title || '---'}
                      </td>
                      <td className="px-3 py-2">
                        {row._isValid ? (
                          <span className="inline-flex items-center gap-1 text-secondary">
                            <CheckCircle2 className="w-3 h-3" />
                            Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-danger" title={row._errors.join(', ')}>
                            <AlertTriangle className="w-3 h-3" />
                            {row._errors[0]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedRows.length > 5 && (
              <div className="px-3 py-2 border-t border-border-light dark:border-[#333] text-[10px] text-text-muted bg-surface/50 dark:bg-[#1a1a1a]">
                Showing 5 of {parsedRows.length} rows
              </div>
            )}
          </div>

          {/* Error summary */}
          {parseError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger/[0.06] border border-danger/10">
              <AlertCircle className="w-4 h-4 text-danger shrink-0" />
              <p className="text-[12px] text-danger">{parseError}</p>
            </div>
          )}

          {invalidCount > 0 && !parseError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/[0.06] border border-warning/10">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
              <p className="text-[12px] text-warning">
                {invalidCount} row{invalidCount !== 1 ? 's' : ''} will be skipped due to validation errors.
                Only valid rows will be scheduled.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={uploading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<Upload className="w-4 h-4" />}
              onClick={handleUpload}
              isLoading={uploading}
              disabled={validCount === 0}
              className="!bg-gradient-to-r !from-primary !via-accent !to-secondary !text-white !shadow-lg !shadow-accent/20"
            >
              Upload & Schedule ({validCount})
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
