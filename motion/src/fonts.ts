/**
 * Font loading for the Remotion bundle.
 *
 * Remotion does not pick up <link> fonts — each font must be loaded through
 * @remotion/google-fonts so it's embedded in every rendered frame. We load
 * Inter (the clean geometric sans used by modern SaaS explainer videos) and
 * export its real family name for templates + the brand kit to use.
 */
import { loadFont } from '@remotion/google-fonts/Inter';

const inter = loadFont('normal', {
  weights: ['400', '500', '600', '700', '800', '900'],
});

/** The actual font-family string to put in CSS once Inter is loaded. */
export const INTER: string = inter.fontFamily;
