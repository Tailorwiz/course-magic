/**
 * Font loading for the Remotion bundle.
 *
 * Remotion does not pick up <link> fonts — each font must be loaded through
 * @remotion/google-fonts so it is embedded in every rendered frame. We load a
 * curated set: Inter (the default) plus the fonts the AI theme-mirroring
 * feature can pick to match a source brand's typography. Every font is loaded
 * at module init, so whichever family the BrandKit references will render.
 *
 * The server's /api/ai/extract-theme endpoint maps a detected font style to
 * one of these family names — keep that map in sync with the families here.
 */
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as loadLora } from '@remotion/google-fonts/Lora';
import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk';

/** Inter — clean geometric sans, the default for modern SaaS explainer videos. */
export const INTER: string = loadInter('normal', {
  weights: ['400', '500', '600', '700', '800', '900'],
}).fontFamily;

/** Montserrat — geometric sans with strong, wide headings. */
export const MONTSERRAT: string = loadMontserrat('normal', {
  weights: ['400', '500', '600', '700', '800'],
}).fontFamily;

/** Poppins — rounded geometric sans, friendly. */
export const POPPINS: string = loadPoppins('normal', {
  weights: ['400', '500', '600', '700', '800'],
}).fontFamily;

/** Playfair Display — high-contrast classic serif for elegant headings. */
export const PLAYFAIR: string = loadPlayfair('normal', {
  weights: ['400', '500', '600', '700', '800', '900'],
}).fontFamily;

/** Lora — readable contemporary serif for body copy. */
export const LORA: string = loadLora('normal', {
  weights: ['400', '500', '600', '700'],
}).fontFamily;

/** Fraunces — characterful modern "soft" serif for distinctive headings. */
export const FRAUNCES: string = loadFraunces('normal', {
  weights: ['400', '500', '600', '700', '800', '900'],
}).fontFamily;

/** Space Grotesk — techy, slightly mono-flavoured sans. */
export const SPACE_GROTESK: string = loadSpaceGrotesk('normal', {
  weights: ['400', '500', '600', '700'],
}).fontFamily;

/** Every curated family — handy for callers that want the full list. */
export const CURATED_FONTS: string[] = [
  INTER,
  MONTSERRAT,
  POPPINS,
  PLAYFAIR,
  LORA,
  FRAUNCES,
  SPACE_GROTESK,
];
