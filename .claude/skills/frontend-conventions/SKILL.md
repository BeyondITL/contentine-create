---
name: frontend-conventions
description: House frontend rules — Lucide only, no emoji, dark mode, .bento-card, brand colors, breakpoints, micro-animations. Use whenever authoring or reviewing UI code.
---

# frontend-conventions

## Icons

- **Lucide only** (`lucide-react`). One icon set for the whole product — visual coherence beats variety.
- No emoji in UI copy. Emoji is fine for `console.log` debug lines and internal docs only.

## Theme

- Dark mode is the ship theme. Light-mode is not a target for launch. Do not add a light-mode toggle.
- Container class `.bento-card` = the app's canonical panel wrapper. Rounded corners, subtle border, subtle shadow, dark surface (Tailwind: `bg-neutral-900/80 border-white/10 rounded-2xl shadow-xl`). Extend it — do not fork.

## Brand palette

| Token | Hex | Role |
|---|---|---|
| Turquoise | `#00C3FF` | Primary CTA, focus rings, key data |
| Green | `#35C838` | Success, "engine ready", progress complete |
| Mauve | `#F3A6FF` | Accent, hover glows, cartoon flair |
| Ink | `#0A0A0F` | Page background |
| Fog | `#E7E7EE` | Body text on dark |

- Use CSS variables (`--tur`, `--grn`, `--mve`) exposed on `:root`; components consume via Tailwind arbitrary values or `var(--tur)`.

## Breakpoints (mobile-first)

| Name | min-width | Notes |
|---|---|---|
| `sm` | 640 px | Phones landscape |
| `md` | 768 px | Tablets |
| `lg` | 1024 px | Small laptops |
| `xl` | 1280 px | Desktops (editor lands here) |

Editor surfaces are `lg`+ only; on `sm`/`md` show a "open on a bigger screen" panel — this is honest, not a facade (Deferral rule under Law L1).

## Micro-animations

- GSAP for scripted timelines and complex sequencing.
- Framer Motion for stateful UI motion (page transitions, list reorders).
- CSS transitions for hover/focus/simple state changes.
- Every hover has a 100–200 ms transition. Every click has a subtle depressed / released feedback. Motion is fast (≤ 250 ms for UI, ≤ 400 ms for storytelling).

## Copy

- Tone: confident, concrete, minimal marketing polish. Never "coming soon" (Law L1).
- Error messages: name the failed step and the next action. Example: "SD-Turbo weights not downloaded. Open Models → Download to continue."

## Accessibility

- Every interactive element has a keyboard path. Modal dialogs trap focus + restore on close.
- Color contrast ≥ 4.5:1 for body, ≥ 3:1 for large text — the mauve accent is not used for text.
- Every icon has an accessible label (Lucide's `aria-label` prop) unless it's decorative next to labeled text.

## File conventions

- Components live in `frontend/src/components/<domain>/<Component>.tsx` — PascalCase.
- Hooks: `frontend/src/hooks/use-<x>.ts` — kebab-case.
- Duplicate resolution rule: prefer `PascalCase.tsx` over `kebab-case.tsx` for React components; merge and delete the loser (see AUDIT_REPORT.md §8 item 1).

## Storybook / demos

- Not a launch target. Do not add a Storybook dependency.

## Verification

- `verify.sh --quick` on every Stop.
- `verify.sh --full` before each C-Mx: `tsc --noEmit`, `eslint --max-warnings=0`, `next build`.
