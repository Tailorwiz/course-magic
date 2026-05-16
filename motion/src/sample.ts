/**
 * Sample video definitions for Phase 1 — hand-authored to prove the engine.
 * In Phase 2 the AI Scene Director produces this exact { brand, scenes }
 * shape automatically from a script.
 */
import type { Scene } from './scenes';
import type { BrandKit } from './brand/brandKit';

/** Demo scenes — a short explainer in the babylovegrowth motion style. */
export const SAMPLE_SCENES: Scene[] = [
  {
    type: 'kineticTitle',
    durationInFrames: 108,
    showMock: true,
    lines: [
      { text: 'Most training videos' },
      { text: 'lose people in 90 seconds', accent: '90 seconds' },
    ],
  },
  {
    type: 'flowchart',
    durationInFrames: 190,
    topTag: 'Students stop watching',
    steps: [
      { text: 'Static slides' },
      { text: 'Attention drops' },
      { text: 'Nobody finishes', bad: true },
    ],
  },
  {
    type: 'bulletBuild',
    durationInFrames: 184,
    title: 'Course Magic fixes that',
    bullets: [
      'Animated scenes, not static slides',
      'Auto-built straight from your script',
      'On-brand for every client',
    ],
  },
  {
    type: 'kineticTitle',
    durationInFrames: 120,
    lines: [
      { text: 'Jobs On Demand Academy' },
      { text: 'videos that actually move', accent: 'actually move' },
    ],
  },
];

/** Brand A — Jobs On Demand Academy (indigo + orange). */
export const BRAND_JOBA: Partial<BrandKit> = {
  name: 'Jobs On Demand Academy',
  primary: '#4f46e5',
  accent: '#ff5a1f',
  ink: '#15171c',
  background: '#ffffff',
  panel: '#f4f5f8',
  danger: '#f0384f',
  tone: 'bold',
};

/**
 * Brand B — the SAME scenes, different brand. Proves brand-awareness:
 * one video definition, themed for a different company (emerald + amber,
 * dark-ink corporate tone).
 */
export const BRAND_ALT: Partial<BrandKit> = {
  name: 'Acme Corp',
  primary: '#0f766e',
  accent: '#f59e0b',
  ink: '#0b1320',
  background: '#fbfaf7',
  panel: '#eef1ee',
  danger: '#dc2626',
  tone: 'corporate',
};

/**
 * Brand C — JobIntel 360. Real brand: navy + crimson pulled from the live
 * app CSS (--secondary 225 33% 25% navy, --primary 351 86% 41% red), plus
 * the official logo (served from motion/public/jobintel-logo.png).
 */
export const BRAND_JOBINTEL: Partial<BrandKit> = {
  name: 'JobIntel 360',
  primary: '#2b3555', // deep navy — structural fills, number badges
  accent: '#c20f2a', // crimson — highlighted words (matches the "360" mark)
  ink: '#1a2138',
  background: '#ffffff',
  panel: '#f1f3f8',
  danger: '#c20f2a',
  logoUrl: 'jobintel-logo.png', // resolved via staticFile() in templates
  tone: 'bold',
};

/** JobIntel 360 demo scenes — opens on the logo, on-brand copy. */
export const SCENES_JOBINTEL: Scene[] = [
  {
    type: 'kineticTitle',
    durationInFrames: 130,
    showLogo: true,
    lines: [
      { text: 'Most job seekers apply' },
      { text: 'into a black hole', accent: 'black hole' },
    ],
  },
  {
    type: 'flowchart',
    durationInFrames: 190,
    topTag: 'No inside information',
    steps: [
      { text: 'Generic application' },
      { text: 'No callback' },
      { text: 'Ghosted', bad: true },
    ],
  },
  {
    type: 'bulletBuild',
    durationInFrames: 188,
    title: 'JobIntel 360 changes that',
    bullets: [
      'Real salary & recruiter intelligence',
      'Know the company before you apply',
      'Spot ghost jobs and scams instantly',
    ],
  },
  {
    type: 'kineticTitle',
    durationInFrames: 124,
    lines: [
      { text: 'JobIntel 360' },
      { text: 'Your unfair advantage', accent: 'unfair advantage' },
    ],
  },
];
