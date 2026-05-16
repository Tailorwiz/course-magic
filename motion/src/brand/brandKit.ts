/**
 * BrandKit — the visual identity every scene template adapts to.
 *
 * A video is rendered "for" a company. The BrandKit holds that company's
 * colors, typography, logo and tone. Every template reads from it, so a
 * single video definition renders on-brand for any client just by swapping
 * this object. It can be filled manually (color pickers in the UI) or
 * auto-extracted from a website URL.
 */

export interface BrandKit {
  /** Company / product name shown in intro + outro scenes. */
  name: string;

  /** Primary brand color — used for solid fills, key shapes, CTA. */
  primary: string;
  /** Accent color — used for the highlighted word in kinetic text, underlines. */
  accent: string;
  /** Main ink/text color (usually near-black). */
  ink: string;
  /** Muted text color (captions, secondary lines). */
  muted: string;
  /** Page/scene background for light scenes. */
  background: string;
  /** Alternate background for "panel" scenes (flowchart, comparison). */
  panel: string;
  /** Warning/negative color — used for problem chains, red states. */
  danger: string;

  /** Google Fonts family name for headings (must exist in @remotion/google-fonts). */
  headingFont: string;
  /** Google Fonts family name for body copy. */
  bodyFont: string;

  /** Optional logo as a data URL or absolute URL. Shown in intro/outro/corner. */
  logoUrl?: string;

  /** Corner radius scale for cards/pills, in px. */
  radius: number;

  /** Overall tone — nudges easing + density. 'bold' = punchy, 'calm' = gentle. */
  tone: 'bold' | 'calm' | 'corporate';
}

// Import path is relative because this file lives in brand/.
import { INTER } from '../fonts';

/** A sensible default used when no brand has been provided yet. */
export const DEFAULT_BRAND: BrandKit = {
  name: 'Course Magic',
  primary: '#4f46e5',
  accent: '#ff5a1f',
  ink: '#15171c',
  muted: '#9aa0ad',
  background: '#ffffff',
  panel: '#f4f5f8',
  danger: '#f0384f',
  headingFont: INTER,
  bodyFont: INTER,
  radius: 16,
  tone: 'bold',
};

/**
 * Merge a partial brand (e.g. extracted from a site, or partly filled by a
 * user) onto the defaults so templates always get a complete BrandKit.
 */
export const resolveBrand = (partial?: Partial<BrandKit>): BrandKit => ({
  ...DEFAULT_BRAND,
  ...(partial || {}),
});

/** Easing tuned per brand tone — bold overshoots slightly, calm is gentle. */
export const toneEasing = (tone: BrandKit['tone']): readonly [number, number, number, number] => {
  switch (tone) {
    case 'calm':
      return [0.33, 1, 0.68, 1];
    case 'corporate':
      return [0.4, 0, 0.2, 1];
    case 'bold':
    default:
      return [0.22, 1, 0.36, 1];
  }
};
