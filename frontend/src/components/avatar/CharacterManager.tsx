'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, User, Sparkles, Hash, Lock, Info } from 'lucide-react';
import type { CharacterAnchor } from '@/types';
import { anchorGenerationParams, anchorSeedConsumptionEnabled } from '@/lib/character-anchor';

interface CharacterManagerProps {
  characters: CharacterAnchor[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
}

/** Character anchor manager — list of saved character presets with CRUD actions. */
export default function CharacterManager({ characters, selectedId, onSelect, onCreate, onDelete }: CharacterManagerProps) {
  const presets = characters.filter((c) => c.is_preset);
  const custom = characters.filter((c) => !c.is_preset);
  const selected = characters.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text dark:text-white">Character Anchors</h3>
          <p className="text-[11px] text-muted mt-0.5">Maintain consistent characters across videos</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-1.5 px-3 py-2.5 md:py-2 bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] rounded-lg text-xs font-medium hover:opacity-90 transition-all active:scale-[0.98] min-h-[44px] md:min-h-0"
        >
          <Plus size={14} />
          New Character
        </button>
      </div>

      {/* Preset characters */}
      {presets.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
            <Sparkles size={10} className="text-accent" />
            Preset Characters
          </h4>
          <div className="space-y-1.5">
            {presets.map((char) => (
              <CharacterRow
                key={char.id}
                character={char}
                isSelected={selectedId === char.id}
                onSelect={() => onSelect(char.id)}
                canDelete={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* User characters */}
      <div>
        <h4 className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">Your Characters</h4>
        {custom.length > 0 ? (
          <div className="space-y-1.5">
            {custom.map((char) => (
              <CharacterRow
                key={char.id}
                character={char}
                isSelected={selectedId === char.id}
                onSelect={() => onSelect(char.id)}
                onDelete={() => onDelete(char.id)}
                canDelete={true}
              />
            ))}
          </div>
        ) : (
          <div className="py-6 text-center">
            <User size={20} className="mx-auto text-muted mb-2" />
            <p className="text-xs text-muted">No custom characters yet</p>
            <p className="text-[11px] text-muted mt-0.5">Create a character to keep consistent visuals across videos</p>
          </div>
        )}
      </div>

      {/* Generation-time consumption — honestly gated (F-6) */}
      {selected && <AnchorConsistencyNote anchor={selected} />}
    </div>
  );
}

/**
 * Honest description of what a selected anchor does at generation time — and an
 * honest gate when it can't yet. The anchor's locked seed keeps the character
 * consistent across scenes ONLY on the on-device image path (IMAGE_GEN_ENABLED,
 * default off). While that's off, we say so plainly instead of implying a
 * consistency the build can't deliver — no fake generation happens here.
 */
function AnchorConsistencyNote({ anchor }: { anchor: CharacterAnchor }) {
  const params = useMemo(() => anchorGenerationParams(anchor), [anchor]);
  const [seedActive, setSeedActive] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    anchorSeedConsumptionEnabled().then((v) => { if (alive) setSeedActive(v); });
    return () => { alive = false; };
  }, []);

  const hasSeed = typeof params.seed === 'number';

  return (
    <div className="rounded-lg border border-border-light dark:border-[#333] bg-surface dark:bg-[#151515] p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="text-accent" />
        <span className="text-[11px] font-semibold text-text dark:text-white">
          Applied when you generate visuals
        </span>
      </div>

      {/* Seed + reference the anchor contributes to the image-gen call path */}
      <div className="flex flex-wrap items-center gap-1.5">
        {hasSeed && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            <Hash size={10} />
            seed {params.seed}
          </span>
        )}
        {params.referencePhoto && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted bg-white dark:bg-[#2a2a2a] px-1.5 py-0.5 rounded">
            <User size={10} />
            reference photo
          </span>
        )}
      </div>

      {params.promptSuffix && (
        <p className="text-[11px] text-muted leading-relaxed">
          Each scene prompt gets: <span className="text-text dark:text-white">&ldquo;{params.promptSuffix}&rdquo;</span>
        </p>
      )}

      {/* Honest gate: seed-lock consistency needs the on-device path */}
      {seedActive === false && (
        <div className="flex items-start gap-1.5 rounded-md bg-accent/5 border border-accent/20 px-2 py-1.5">
          <Lock size={11} className="text-accent mt-0.5 shrink-0" />
          <p className="text-[10px] text-accent leading-relaxed">
            On-device image generation is off in this build, so {anchor.name}&rsquo;s locked seed can&rsquo;t pin the
            look across scenes yet. The description above still guides generation when a DALL-E key is configured.
            Seed-locked cross-scene consistency turns on with on-device image generation.
          </p>
        </div>
      )}

      {seedActive === true && hasSeed && (
        <div className="flex items-start gap-1.5 rounded-md bg-secondary/5 border border-secondary/20 px-2 py-1.5">
          <Info size={11} className="text-secondary mt-0.5 shrink-0" />
          <p className="text-[10px] text-secondary leading-relaxed">
            The locked seed keeps {anchor.name} visually consistent across every generated scene on your device.
          </p>
        </div>
      )}
    </div>
  );
}

/** Single character row. */
function CharacterRow({
  character,
  isSelected,
  onSelect,
  onDelete,
  canDelete,
}: {
  character: CharacterAnchor;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  canDelete: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        group w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg border transition-all text-left min-h-[44px]
        ${isSelected
          ? 'border-primary bg-primary-bg dark:bg-primary/10'
          : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
        }
      `}
    >
      {/* Thumbnail */}
      <div className="w-11 h-11 md:w-10 md:h-10 rounded-lg overflow-hidden bg-surface dark:bg-[#151515] shrink-0">
        {character.photo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={character.photo_path} alt={character.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User size={16} className="text-muted" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text dark:text-white truncate">{character.name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {character.gender && (
            <span className="text-[10px] text-muted capitalize">{character.gender}</span>
          )}
          {character.art_style && (
            <>
              <span className="text-[10px] text-muted">&middot;</span>
              <span className="text-[10px] text-muted capitalize">{character.art_style}</span>
            </>
          )}
          {typeof character.seed_value === 'number' && (
            <>
              <span className="text-[10px] text-muted">&middot;</span>
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted tabular-nums" title="Locked seed for consistent generation">
                <Hash size={9} />
                {character.seed_value}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      {canDelete && onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-2 md:p-1 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center"
          aria-label="Delete character"
        >
          <Trash2 size={14} />
        </button>
      )}
    </button>
  );
}
