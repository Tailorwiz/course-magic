/**
 * MotionVideoWizard — the Motion Video builder.
 *
 * A 5-step wizard: Source -> Script -> Scenes -> Style -> Render.
 *  - Source: bring in content 4 ways (write a script, AI-generate one, upload
 *    a document/PDF, or point at a URL) + focus instructions + length.
 *  - Script: STAGE 1 — the AI reads all the content and writes the COMPLETE
 *    narration script. The user reviews/edits it before any scenes exist.
 *  - Scenes: STAGE 2 — the AI Scene Director segments the approved script and
 *    fit-matches each beat to a template, producing an editable scene list.
 *  - Style: brand kit, narration voice, background music.
 *  - Render: server-side render on AWS Lambda, with live progress.
 */
import React, { useState, useRef } from 'react';
import { apiFetch } from '../api';
import { Button } from '../components/Button';
import { Input, TextArea } from '../components/Input';
import {
  Sparkles, Loader2, Film, Download, Trash2, ChevronLeft, ChevronRight,
  Upload, FileText, Globe, PenLine, Wand2, Plus, ArrowUp, ArrowDown, Play,
} from 'lucide-react';

interface MotionVideoWizardProps {
  onCancel: () => void;
}

/**
 * Parse a fetch Response as JSON, but turn an empty/non-JSON body (which
 * happens when the API server is mid-restart) into a clear message instead
 * of the cryptic "Unexpected end of JSON input".
 */
async function readJson(r: Response): Promise<any> {
  const text = await r.text();
  if (!text || !text.trim()) {
    throw new Error('The server didn’t respond — it may be restarting. Wait a few seconds and try again.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The server returned an unexpected response. Try again in a moment.');
  }
}

// --- Voice + music options --------------------------------------------------

const VOICES = [
  { id: 'af_heart', name: 'Heart — warm, expressive (F)' },
  { id: 'af_bella', name: 'Bella — confident, professional (F)' },
  { id: 'af_nova', name: 'Nova — clear, authoritative (F)' },
  { id: 'af_sarah', name: 'Sarah — gentle, sincere (F)' },
  { id: 'bf_emma', name: 'Emma — elegant British (F)' },
  { id: 'am_echo', name: 'Echo — smooth, clear (M)' },
  { id: 'am_adam', name: 'Adam — strong, authoritative (M)' },
  { id: 'am_onyx', name: 'Onyx — rich, dramatic (M)' },
  { id: 'am_eric', name: 'Eric — steady, trustworthy (M)' },
  { id: 'bm_george', name: 'George — refined British (M)' },
];

const MUSIC = [
  { label: 'No music', url: '' },
  { label: 'Inspirational Rise', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { label: 'Educational Lo-Fi', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { label: 'Corporate Success', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { label: 'Deep Focus', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
];

/** A track returned by the music search (/api/motion/find-music). */
interface MusicResult {
  url: string;
  title: string;
  artist: string;
  duration: number; // milliseconds
  license: string;
  source: string;
}

/** Format a millisecond duration as m:ss. */
const fmtDur = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// --- Scene model (mirrors motion/src/scenes.ts) -----------------------------

type SceneTransition = 'fade' | 'slide' | 'wipe' | 'flip' | 'clockWipe' | 'none';
interface SceneCommon { durationInFrames: number; narration?: string; transition?: SceneTransition }
type Scene = SceneCommon & ({ type: 'kineticTitle'; lines: { text: string; accent?: string }[]; showLogo?: boolean }
  | { type: 'flowchart'; topTag?: string; steps: { text: string; bad?: boolean }[] }
  | { type: 'bulletBuild'; title: string; bullets: string[] }
  | { type: 'statCountUp'; value: number; prefix?: string; suffix?: string; label: string; caption?: string }
  | { type: 'beforeAfter'; before: { heading: string; points: string[] }; after: { heading: string; points: string[] } }
  | { type: 'numberedSteps'; title?: string; steps: { title: string; detail?: string }[] }
  | { type: 'quoteCard'; quote: string; author?: string; role?: string }
  | { type: 'checklist'; title?: string; items: string[] }
  | { type: 'timeline'; title?: string; events: { when: string; text: string }[] }
  | { type: 'ctaEndCard'; headline: string; sub?: string; cta: string; url?: string }
  | { type: 'media'; mediaUrl: string; mediaType: 'image' | 'video'; frame: 'browser' | 'laptop' | 'phone' | 'none'; kenBurns?: boolean; caption?: string });

const SCENE_LABEL: Record<string, string> = {
  kineticTitle: 'Kinetic Title', flowchart: 'Flowchart', bulletBuild: 'Bullet List',
  statCountUp: 'Stat / Number', beforeAfter: 'Before / After', numberedSteps: 'Numbered Steps',
  quoteCard: 'Quote', checklist: 'Checklist', timeline: 'Timeline', ctaEndCard: 'Call to Action',
  media: 'Product Media',
};

/** A blank scene of each type, for the "Add scene" picker. */
const SCENE_DEFAULTS: Record<string, () => Scene> = {
  kineticTitle: () => ({ type: 'kineticTitle', durationInFrames: 90, narration: '', lines: [{ text: 'Headline' }, { text: '' }] }),
  bulletBuild: () => ({ type: 'bulletBuild', durationInFrames: 90, narration: '', title: 'Title', bullets: ['Point one', 'Point two'] }),
  flowchart: () => ({ type: 'flowchart', durationInFrames: 90, narration: '', topTag: '', steps: [{ text: 'Step' }, { text: 'Result', bad: true }] }),
  statCountUp: () => ({ type: 'statCountUp', durationInFrames: 90, narration: '', value: 100, suffix: '%', label: 'What it means' }),
  beforeAfter: () => ({ type: 'beforeAfter', durationInFrames: 90, narration: '', before: { heading: 'Before', points: ['Problem'] }, after: { heading: 'After', points: ['Solution'] } }),
  numberedSteps: () => ({ type: 'numberedSteps', durationInFrames: 90, narration: '', title: 'How it works', steps: [{ title: 'Step one' }, { title: 'Step two' }] }),
  quoteCard: () => ({ type: 'quoteCard', durationInFrames: 90, narration: '', quote: 'A quote.', author: '', role: '' }),
  checklist: () => ({ type: 'checklist', durationInFrames: 90, narration: '', title: 'Checklist', items: ['Item one', 'Item two'] }),
  timeline: () => ({ type: 'timeline', durationInFrames: 90, narration: '', title: 'Timeline', events: [{ when: 'Day 1', text: 'Start' }, { when: 'Day 2', text: 'Finish' }] }),
  ctaEndCard: () => ({ type: 'ctaEndCard', durationInFrames: 90, narration: '', headline: 'Get started', cta: 'Try it now', url: '' }),
  media: () => ({ type: 'media', durationInFrames: 120, narration: '', mediaUrl: '', mediaType: 'image', frame: 'browser', kenBurns: true, caption: '' }),
};

// --- Small list editor ------------------------------------------------------

const ListEditor: React.FC<{
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  max?: number;
}> = ({ label, items, onChange, max = 6 }) => (
  <div>
    <label className="block text-sm font-bold text-slate-600 mb-1">{label}</label>
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={it}
            onChange={(e) => onChange(items.map((x, xi) => (xi === i ? e.target.value : x)))}
            className="flex-1 border border-slate-300 rounded-lg p-2 text-sm"
          />
          <button
            onClick={() => onChange(items.filter((_, xi) => xi !== i))}
            className="text-slate-400 hover:text-red-500 px-1"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {items.length < max && (
        <button
          onClick={() => onChange([...items, ''])}
          className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded flex items-center gap-1"
        >
          <Plus size={13} /> Add
        </button>
      )}
    </div>
  </div>
);

// --- Per-scene editor -------------------------------------------------------

const SceneCard: React.FC<{
  scene: Scene;
  index: number;
  total: number;
  siteImages?: string[];
  onChange: (patch: Partial<Scene>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}> = ({ scene, index, total, siteImages, onChange, onMove, onDelete }) => {
  const set = (patch: any) => onChange(patch);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaErr, setMediaErr] = useState('');
  const [captureUrl, setCaptureUrl] = useState('');
  const [imgQuery, setImgQuery] = useState('');
  const [imgResults, setImgResults] = useState<{ url: string; thumb: string; source: string }[]>([]);
  const [imgSearching, setImgSearching] = useState(false);

  // Search the web for an image to use in this scene.
  const searchImages = async () => {
    if (!imgQuery.trim()) return;
    setMediaErr('');
    setImgSearching(true);
    try {
      const resp = await apiFetch('/api/motion/find-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: imgQuery.trim(), count: 12 }),
      });
      const data = await readJson(resp);
      if (!resp.ok) throw new Error(data.error || 'Image search failed');
      setImgResults(data.images || []);
    } catch (err: any) {
      setMediaErr(err?.message || 'Image search failed');
    } finally {
      setImgSearching(false);
    }
  };

  // Upload a product screenshot / screen recording for a media scene.
  const onMediaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaErr('');
    setMediaBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await apiFetch('/api/motion/upload-asset', { method: 'POST', body: form });
      const data = await readJson(resp);
      if (!resp.ok || !data.url) throw new Error(data.error || 'Upload failed');
      set({ mediaUrl: data.url, mediaType: file.type.startsWith('video') ? 'video' : 'image' });
    } catch (err: any) {
      setMediaErr(err?.message || 'Upload failed');
    } finally {
      setMediaBusy(false);
    }
  };

  // Capture a screenshot of a website for a media scene.
  const onCapture = async () => {
    if (!captureUrl.trim()) return;
    setMediaErr('');
    setMediaBusy(true);
    try {
      const resp = await apiFetch('/api/motion/capture-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: captureUrl.trim() }),
      });
      const data = await readJson(resp);
      if (!resp.ok || !data.url) throw new Error(data.error || 'Capture failed');
      set({ mediaUrl: data.url, mediaType: 'image' });
    } catch (err: any) {
      setMediaErr(err?.message || 'Capture failed');
    } finally {
      setMediaBusy(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">
          {index + 1}. {SCENE_LABEL[scene.type] || scene.type}
        </span>
        <div className="flex items-center gap-1">
          <button disabled={index === 0} onClick={() => onMove(-1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-25"><ArrowUp size={15} /></button>
          <button disabled={index === total - 1} onClick={() => onMove(1)} className="text-slate-400 hover:text-slate-700 disabled:opacity-25"><ArrowDown size={15} /></button>
          {total > 1 && <button onClick={onDelete} className="text-slate-400 hover:text-red-500 ml-1"><Trash2 size={15} /></button>}
        </div>
      </div>

      <TextArea label="Narration (spoken)" rows={2} value={scene.narration || ''} onChange={(e) => set({ narration: e.target.value })} />

      {scene.type === 'kineticTitle' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Headline line 1" value={scene.lines[0]?.text || ''} onChange={(e) => set({ lines: [{ text: e.target.value }, scene.lines[1] || { text: '' }] })} />
          <Input label="Headline line 2" value={scene.lines[1]?.text || ''} onChange={(e) => set({ lines: [scene.lines[0] || { text: '' }, { text: e.target.value, accent: scene.lines[1]?.accent }] })} />
          <Input label="Accent word (line 2)" value={scene.lines[1]?.accent || ''} onChange={(e) => set({ lines: [scene.lines[0] || { text: '' }, { text: scene.lines[1]?.text || '', accent: e.target.value }] })} />
        </div>
      )}
      {scene.type === 'flowchart' && (
        <div className="space-y-2">
          <Input label="Top tag" value={scene.topTag || ''} onChange={(e) => set({ topTag: e.target.value })} />
          <ListEditor label="Steps" max={5} items={scene.steps.map((s) => s.text)} onChange={(v) => set({ steps: v.map((t, i) => ({ text: t, bad: i === v.length - 1 })) })} />
        </div>
      )}
      {scene.type === 'bulletBuild' && (
        <div className="space-y-2">
          <Input label="Title" value={scene.title} onChange={(e) => set({ title: e.target.value })} />
          <ListEditor label="Bullets" items={scene.bullets} onChange={(v) => set({ bullets: v })} />
        </div>
      )}
      {scene.type === 'statCountUp' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input label="Prefix" value={scene.prefix || ''} onChange={(e) => set({ prefix: e.target.value })} />
          <Input label="Number" value={String(scene.value)} onChange={(e) => set({ value: Number(e.target.value) || 0 })} />
          <Input label="Suffix" value={scene.suffix || ''} onChange={(e) => set({ suffix: e.target.value })} />
          <Input label="Caption" value={scene.caption || ''} onChange={(e) => set({ caption: e.target.value })} />
          <div className="col-span-2 md:col-span-4"><Input label="Label" value={scene.label} onChange={(e) => set({ label: e.target.value })} /></div>
        </div>
      )}
      {scene.type === 'beforeAfter' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Input label="Before heading" value={scene.before.heading} onChange={(e) => set({ before: { ...scene.before, heading: e.target.value } })} />
            <ListEditor label="Before points" max={5} items={scene.before.points} onChange={(v) => set({ before: { ...scene.before, points: v } })} />
          </div>
          <div className="space-y-2">
            <Input label="After heading" value={scene.after.heading} onChange={(e) => set({ after: { ...scene.after, heading: e.target.value } })} />
            <ListEditor label="After points" max={5} items={scene.after.points} onChange={(v) => set({ after: { ...scene.after, points: v } })} />
          </div>
        </div>
      )}
      {scene.type === 'numberedSteps' && (
        <div className="space-y-2">
          <Input label="Title" value={scene.title || ''} onChange={(e) => set({ title: e.target.value })} />
          <ListEditor label="Steps" max={5} items={scene.steps.map((s) => s.title)} onChange={(v) => set({ steps: v.map((t, i) => ({ title: t, detail: scene.steps[i]?.detail })) })} />
        </div>
      )}
      {scene.type === 'quoteCard' && (
        <div className="space-y-2">
          <TextArea label="Quote" rows={2} value={scene.quote} onChange={(e) => set({ quote: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Author" value={scene.author || ''} onChange={(e) => set({ author: e.target.value })} />
            <Input label="Role" value={scene.role || ''} onChange={(e) => set({ role: e.target.value })} />
          </div>
        </div>
      )}
      {scene.type === 'checklist' && (
        <div className="space-y-2">
          <Input label="Title" value={scene.title || ''} onChange={(e) => set({ title: e.target.value })} />
          <ListEditor label="Items" items={scene.items} onChange={(v) => set({ items: v })} />
        </div>
      )}
      {scene.type === 'timeline' && (
        <div className="space-y-2">
          <Input label="Title" value={scene.title || ''} onChange={(e) => set({ title: e.target.value })} />
          {scene.events.map((ev, i) => (
            <div key={i} className="flex gap-2">
              <input value={ev.when} placeholder="When" onChange={(e) => set({ events: scene.events.map((x, xi) => xi === i ? { ...x, when: e.target.value } : x) })} className="w-32 border border-slate-300 rounded-lg p-2 text-sm" />
              <input value={ev.text} placeholder="What" onChange={(e) => set({ events: scene.events.map((x, xi) => xi === i ? { ...x, text: e.target.value } : x) })} className="flex-1 border border-slate-300 rounded-lg p-2 text-sm" />
              <button onClick={() => set({ events: scene.events.filter((_, xi) => xi !== i) })} className="text-slate-400 hover:text-red-500 px-1"><Trash2 size={15} /></button>
            </div>
          ))}
          {scene.events.length < 6 && (
            <button onClick={() => set({ events: [...scene.events, { when: '', text: '' }] })} className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded flex items-center gap-1"><Plus size={13} /> Add event</button>
          )}
        </div>
      )}
      {scene.type === 'ctaEndCard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Headline" value={scene.headline} onChange={(e) => set({ headline: e.target.value })} />
          <Input label="Subline" value={scene.sub || ''} onChange={(e) => set({ sub: e.target.value })} />
          <Input label="Button text" value={scene.cta} onChange={(e) => set({ cta: e.target.value })} />
          <Input label="URL" value={scene.url || ''} onChange={(e) => set({ url: e.target.value })} />
        </div>
      )}
      {scene.type === 'media' && (
        <div className="space-y-3">
          {scene.mediaUrl ? (
            <div className="flex items-center gap-3">
              {scene.mediaType === 'video' ? (
                <video src={scene.mediaUrl} className="h-24 rounded border border-slate-200" />
              ) : (
                <img src={scene.mediaUrl} className="h-24 rounded border border-slate-200 object-contain bg-white" />
              )}
              <button onClick={() => set({ mediaUrl: '' })} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="cursor-pointer border-2 border-dashed border-slate-300 rounded-lg px-3 py-3 flex items-center justify-center gap-2 text-sm text-slate-500 hover:bg-slate-50">
                {mediaBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {mediaBusy ? 'Working…' : 'Upload screenshot or screen recording'}
                <input type="file" accept="image/*,video/*" className="hidden" onChange={onMediaFile} disabled={mediaBusy} />
              </label>
              <div className="flex gap-2">
                <input
                  value={captureUrl}
                  onChange={(e) => setCaptureUrl(e.target.value)}
                  placeholder="…or capture a website URL"
                  className="flex-1 border border-slate-300 rounded-lg p-2 text-sm"
                />
                <button onClick={onCapture} disabled={mediaBusy} className="px-3 bg-slate-800 text-white rounded-lg text-sm font-bold disabled:opacity-50">Capture</button>
              </div>
              <div className="flex gap-2">
                <input
                  value={imgQuery}
                  onChange={(e) => setImgQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') searchImages(); }}
                  placeholder="…or search the web for an image"
                  className="flex-1 border border-slate-300 rounded-lg p-2 text-sm"
                />
                <button onClick={searchImages} disabled={imgSearching} className="px-3 bg-indigo-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                  {imgSearching ? '…' : 'Search'}
                </button>
              </div>
              {imgResults.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {imgResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => set({ mediaUrl: r.url, mediaType: 'image' })}
                      className="aspect-video rounded overflow-hidden border border-slate-200 hover:ring-2 hover:ring-indigo-500"
                    >
                      <img src={r.thumb} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {siteImages && siteImages.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-1">From your source website</div>
                  <div className="grid grid-cols-4 gap-2">
                    {siteImages.map((u, i) => (
                      <button
                        key={i}
                        onClick={() => set({ mediaUrl: u, mediaType: 'image' })}
                        className="aspect-video rounded overflow-hidden border border-slate-200 hover:ring-2 hover:ring-indigo-500"
                      >
                        <img src={u} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {mediaErr && <div className="text-xs text-red-600">{mediaErr}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Device frame</label>
              <select value={scene.frame} onChange={(e) => set({ frame: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2 text-sm">
                <option value="browser">Browser window</option>
                <option value="laptop">Laptop</option>
                <option value="phone">Phone</option>
                <option value="none">No frame</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-600 mt-7">
              <input type="checkbox" checked={!!scene.kenBurns} onChange={(e) => set({ kenBurns: e.target.checked })} />
              Ken Burns zoom
            </label>
          </div>
          <Input label="Caption (optional)" value={scene.caption || ''} onChange={(e) => set({ caption: e.target.value })} />
        </div>
      )}
    </div>
  );
};

// --- Main component ---------------------------------------------------------

type WizardStep = 'source' | 'script' | 'scenes' | 'style' | 'rendering' | 'done';
type SourceMode = 'write' | 'ai' | 'document' | 'url';

/** Brand name shown until the source content tells us the real one. */
const DEFAULT_BRAND = 'Course Magic';

/** Target video lengths. The scriptwriter sizes the narration to match. */
const LENGTHS: { id: string; label: string; minutes?: number }[] = [
  { id: 'auto', label: 'Auto — tight & punchy (~90-160s)' },
  { id: 'short', label: 'Short — about 1 minute', minutes: 1 },
  { id: 'standard', label: 'Standard — about 2 minutes', minutes: 2 },
  { id: 'detailed', label: 'Detailed — about 3-4 minutes', minutes: 3.5 },
];

/** Extra BrandKit fields mirrored from a source (beyond primary/accent/tone). */
type ThemePalette = Partial<{
  ink: string;
  muted: string;
  background: string;
  panel: string;
  danger: string;
  radius: number;
  headingFont: string;
  bodyFont: string;
}>;

export const MotionVideoWizard: React.FC<MotionVideoWizardProps> = ({ onCancel }) => {
  const [step, setStep] = useState<WizardStep>('source');
  const [error, setError] = useState('');

  // Source
  const [sourceMode, setSourceMode] = useState<SourceMode>('write');
  const [scriptText, setScriptText] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [focus, setFocus] = useState('');
  const [videoLength, setVideoLength] = useState('auto');
  const [mirrorTheme, setMirrorTheme] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);

  // Script (Stage 1 — the full narration script, reviewed before scenes exist)
  const [fullScript, setFullScript] = useState('');
  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptProvider, setScriptProvider] = useState('');

  // Scenes
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [scenesBusy, setScenesBusy] = useState(false);
  const [siteImages, setSiteImages] = useState<string[]>([]);
  // Images scraped from the source site (with alt text) — the AI Scene
  // Director uses these to auto-place `media` scenes.
  const [imageCatalog, setImageCatalog] = useState<{ url: string; alt: string }[]>([]);

  // Style — brand
  const [brandName, setBrandName] = useState(DEFAULT_BRAND);
  const [primary, setPrimary] = useState('#4f46e5');
  const [accent, setAccent] = useState('#ff5a1f');
  const [tone, setTone] = useState<'bold' | 'calm' | 'corporate'>('bold');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  // Theme mirrored from the source (extra BrandKit fields beyond primary/
  // accent/tone) — applied to the render when set.
  const [themePalette, setThemePalette] = useState<ThemePalette | null>(null);
  const [themeScreenshot, setThemeScreenshot] = useState('');
  // Style — voice + music
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [musicUrl, setMusicUrl] = useState(MUSIC[1].url);
  const [musicMode, setMusicMode] = useState<'continuous' | 'introOutro'>('continuous');
  // Tracks the user added themselves (uploaded or picked from search) — these
  // get appended to the music dropdown.
  const [uploadedMusic, setUploadedMusic] = useState<{ label: string; url: string }[]>([]);
  const [musicBusy, setMusicBusy] = useState(false);
  // Music search (Openverse audio).
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState<MusicResult[]>([]);
  const [musicSearching, setMusicSearching] = useState(false);

  // Render
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const musicPreviewRef = useRef<HTMLAudioElement | null>(null);

  const updateScene = (i: number, patch: Partial<Scene>) =>
    setScenes((prev) => prev.map((s, idx) => (idx === i ? ({ ...s, ...patch } as Scene) : s)));
  const moveScene = (i: number, dir: -1 | 1) =>
    setScenes((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const fileToBase64 = (file: File): Promise<{ data: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const s = reader.result as string;
        resolve({ data: s.split(',')[1], mimeType: file.type });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const targetMinutes = LENGTHS.find((l) => l.id === videoLength)?.minutes;

  // --- Step 1 -> Step 2: resolve the raw source content, then run STAGE 1
  // (the scriptwriter) to produce the full narration script for review.
  const buildScript = async () => {
    setError('');
    setSourceBusy(true);
    try {
      let rawContent = '';
      let fromTopic = false;

      // Auto-fill the brand name from the source — but never clobber a name
      // the user has already typed themselves.
      let resolvedBrand = brandName;
      const autofillBrand = (name?: string) => {
        const n = (name || '').trim().slice(0, 60);
        if (n && (brandName === DEFAULT_BRAND || !brandName.trim())) {
          resolvedBrand = n;
          setBrandName(n);
        }
      };

      // When "mirror theme" is on, read the source's colors/fonts/style and
      // apply them to the Style step. Best-effort — a failure is non-fatal.
      const applyMirroredTheme = async (body: Record<string, unknown>) => {
        if (!mirrorTheme) return;
        try {
          const r = await apiFetch('/api/ai/extract-theme', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const d = await readJson(r);
          if (!r.ok || !d.theme) return;
          const { primary: p, accent: a, tone: to, ...rest } = d.theme;
          if (p) setPrimary(p);
          if (a) setAccent(a);
          if (to) setTone(to);
          setThemePalette(rest as ThemePalette);
          if (d.screenshotUrl) setThemeScreenshot(d.screenshotUrl);
        } catch {
          /* theme mirroring is optional — keep building */
        }
      };

      if (sourceMode === 'write') {
        rawContent = scriptText.trim();
        if (rawContent.length < 20) throw new Error('Write a longer script (at least a few sentences).');
        // The user wrote the script themselves — use it directly, no rewrite.
        setFullScript(rawContent);
        setScriptProvider('you');
        setSourceBusy(false);
        setStep('script');
        return;
      } else if (sourceMode === 'ai') {
        if (!aiTopic.trim()) throw new Error('Enter a topic for the AI to write about.');
        rawContent = aiTopic.trim();
        fromTopic = true;
      } else if (sourceMode === 'document') {
        if (!docFile) throw new Error('Upload a document first.');
        const { data, mimeType } = await fileToBase64(docFile);
        const r = await apiFetch('/api/ai/generate-from-file', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: 'Extract the full readable content of this document as plain text for use as a video script source.',
            fileData: data, fileMimeType: mimeType, jsonMode: false, maxTokens: 6000,
          }),
        });
        const d = await readJson(r);
        if (!r.ok || !d.text) throw new Error(d.error || 'Could not read that document');
        rawContent = d.text;
        autofillBrand(docFile.name.replace(/\.[^.]+$/, ''));
        await applyMirroredTheme({ fileData: data, fileMimeType: mimeType });
      } else if (sourceMode === 'url') {
        if (!urlInput.trim()) throw new Error('Enter a website URL.');
        const r = await apiFetch('/api/ai/extract-url', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlInput.trim() }),
        });
        const d = await readJson(r);
        if (!r.ok || !d.text) throw new Error(d.error || 'Could not read that URL');
        rawContent = d.text;
        if (Array.isArray(d.images)) setSiteImages(d.images);
        if (Array.isArray(d.imageCatalog)) setImageCatalog(d.imageCatalog);
        autofillBrand(d.title);
        await applyMirroredTheme({ url: urlInput.trim() });
      }

      // Stage 1 — the scriptwriter reads the content and writes the full script.
      setSourceBusy(false);
      setScriptBusy(true);
      setStep('script');
      const sr = await apiFetch('/api/ai/generate-script', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceText: rawContent,
          focusInstructions: focus.trim() || undefined,
          brandName: resolvedBrand,
          targetMinutes,
          fromTopic,
        }),
      });
      const sd = await readJson(sr);
      if (!sr.ok || !sd.script) {
        throw new Error(sd.error || 'The scriptwriter could not write a script — try different content.');
      }
      setFullScript(sd.script);
      setScriptProvider(sd.provider || '');
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
      setStep('source');
    } finally {
      setSourceBusy(false);
      setScriptBusy(false);
    }
  };

  // --- Step 2 -> Step 3: STAGE 2 — segment the approved script into scenes.
  const buildScenes = async () => {
    if (fullScript.trim().length < 20) {
      setError('The script is too short — add more before generating scenes.');
      return;
    }
    setError('');
    setScenesBusy(true);
    setStep('scenes');
    try {
      const sr = await apiFetch('/api/ai/generate-scenes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: fullScript.trim(),
          focusInstructions: focus.trim() || undefined,
          brandName,
          images: imageCatalog,
        }),
      });
      const sd = await readJson(sr);
      if (!sr.ok || !Array.isArray(sd.scenes) || sd.scenes.length === 0) {
        throw new Error(sd.error || 'The Scene Director could not build scenes — try editing the script.');
      }
      setScenes(sd.scenes);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
      setStep('script');
    } finally {
      setScenesBusy(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      setError('Logo must be an image file.');
      return;
    }
    setError('');
    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await apiFetch('/api/motion/upload-asset', { method: 'POST', body: form });
      const data = await readJson(resp);
      if (!resp.ok || !data.url) throw new Error(data.error || 'Upload failed');
      setLogoUrl(data.url);
    } catch (err: any) {
      setError(err?.message || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  };

  // Upload a music track of the user's own — stored in Supabase, so the Lambda
  // renderer can fetch it reliably (unlike most hotlinked third-party tracks).
  const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setError('Music must be an audio file (MP3, WAV, M4A…).');
      return;
    }
    setError('');
    setMusicBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await apiFetch('/api/motion/upload-asset', { method: 'POST', body: form });
      const data = await readJson(resp);
      if (!resp.ok || !data.url) throw new Error(data.error || 'Upload failed');
      const label = file.name.replace(/\.[^.]+$/, '').slice(0, 50) || 'Uploaded track';
      setUploadedMusic((prev) => [...prev, { label, url: data.url }]);
      setMusicUrl(data.url);
    } catch (err: any) {
      setError(err?.message || 'Music upload failed');
    } finally {
      setMusicBusy(false);
    }
  };

  // Preview a track. Pass a url to preview a specific one; clicking the track
  // that's already playing stops it.
  const previewMusic = (url?: string) => {
    const src = url || musicUrl;
    if (!src) return;
    const abs = (() => { try { return new URL(src, window.location.href).href; } catch { return src; } })();
    const cur = musicPreviewRef.current;
    if (cur) {
      cur.pause();
      musicPreviewRef.current = null;
      if (cur.src === abs) return;
    }
    const a = new Audio(src);
    a.volume = 0.5;
    a.play().catch(() => undefined);
    a.onended = () => { musicPreviewRef.current = null; };
    musicPreviewRef.current = a;
  };

  // Search Openverse audio for background music.
  const searchMusic = async () => {
    if (!musicQuery.trim()) return;
    setError('');
    setMusicSearching(true);
    try {
      const resp = await apiFetch('/api/motion/find-music', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: musicQuery.trim(), count: 24 }),
      });
      const data = await readJson(resp);
      if (!resp.ok) throw new Error(data.error || 'Music search failed');
      setMusicResults(data.tracks || []);
    } catch (err: any) {
      setError(err?.message || 'Music search failed');
    } finally {
      setMusicSearching(false);
    }
  };

  // Add a searched track to the dropdown and select it.
  const useTrack = (t: MusicResult) => {
    const label = `${t.title}${t.artist ? ` — ${t.artist}` : ''}`.slice(0, 60);
    setUploadedMusic((prev) => (prev.some((m) => m.url === t.url) ? prev : [...prev, { label, url: t.url }]));
    setMusicUrl(t.url);
  };

  const startRender = async () => {
    setError('');
    setProgress(0);
    setStage('starting');
    setStep('rendering');
    if (musicPreviewRef.current) { musicPreviewRef.current.pause(); musicPreviewRef.current = null; }
    try {
      // themePalette (mirrored ink/bg/fonts/radius…) goes first so the editable
    // primary/accent/tone pickers always win.
    const brand = {
      ...(themePalette || {}),
      name: brandName, primary, accent, tone,
      logoUrl: logoUrl || undefined,
    };
      const resp = await apiFetch('/api/motion/render', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes, brand, voiceId,
          voiceOpts: { speed: voiceSpeed },
          music: { url: musicUrl || undefined, mode: musicMode },
        }),
      });
      const data = await readJson(resp);
      if (!resp.ok) throw new Error(data.error || 'Failed to start render');
      const jobId = data.jobId;
      pollRef.current = setInterval(async () => {
        try {
          const s = await apiFetch(`/api/motion/render/${jobId}`).then((r) => readJson(r));
          setProgress(s.progress || 0);
          setStage(s.stage || s.status || '');
          if (s.status === 'done') {
            if (pollRef.current) clearInterval(pollRef.current);
            setVideoUrl(s.videoUrl);
            setStep('done');
          } else if (s.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(s.error || 'Render failed');
            setStep('style');
          }
        } catch { /* transient — keep polling */ }
      }, 2500);
    } catch (e: any) {
      setError(e?.message || 'Render failed');
      setStep('style');
    }
  };

  // --- Render states -------------------------------------------------------

  if (step === 'rendering') {
    return (
      <div className="max-w-2xl mx-auto py-20 px-6 text-center">
        <Loader2 size={48} className="animate-spin text-indigo-600 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Rendering your motion video…</h2>
        <p className="text-slate-500 mb-6 capitalize">
          {stage === 'tts' ? 'Generating narration' : stage === 'render' ? 'Animating scenes' : stage}
        </p>
        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
          <div className="bg-indigo-600 h-full transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="text-sm text-slate-400 mt-3">{Math.round(progress * 100)}%</p>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Film className="text-indigo-600" /> Your motion video is ready
        </h2>
        <video src={videoUrl} controls className="w-full rounded-xl shadow-lg bg-black" />
        <div className="flex gap-3 mt-6">
          <Button onClick={() => window.open(videoUrl, '_blank')} icon={<Download size={16} />}>Download MP4</Button>
          <Button variant="secondary" onClick={() => setStep('scenes')} icon={<ChevronLeft size={16} />}>Edit & re-render</Button>
          <Button variant="secondary" onClick={onCancel}>Done</Button>
        </div>
      </div>
    );
  }

  // --- Header + step content ----------------------------------------------

  const steps: { id: WizardStep; label: string }[] = [
    { id: 'source', label: 'Source' },
    { id: 'script', label: 'Script' },
    { id: 'scenes', label: 'Scenes' },
    { id: 'style', label: 'Style' },
  ];

  return (
    <div className="max-w-4xl mx-auto py-8 px-6 space-y-6">
      <div className="flex items-center gap-3">
        <Film className="text-indigo-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Motion Video</h1>
          <p className="text-slate-500 text-sm">Brand-aware animated explainer videos.</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${step === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              <span>{i + 1}</span>{s.label}
            </div>
            {i < steps.length - 1 && <ChevronRight size={16} className="text-slate-300" />}
          </React.Fragment>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {/* STEP 1 — SOURCE */}
      {step === 'source' && (
        <div className="space-y-5">
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="font-bold text-slate-700">Where should the content come from?</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {([
                { id: 'write', label: 'Write a script', icon: <PenLine size={18} /> },
                { id: 'ai', label: 'AI writes it', icon: <Wand2 size={18} /> },
                { id: 'document', label: 'Upload document', icon: <FileText size={18} /> },
                { id: 'url', label: 'From a URL', icon: <Globe size={18} /> },
              ] as { id: SourceMode; label: string; icon: React.ReactNode }[]).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSourceMode(m.id)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${sourceMode === m.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  {m.icon}
                  <span className="text-xs font-bold text-center">{m.label}</span>
                </button>
              ))}
            </div>

            {sourceMode === 'write' && (
              <TextArea label="Your script" rows={8} value={scriptText} onChange={(e) => setScriptText(e.target.value)} placeholder="Paste or write the script for your video…" />
            )}
            {sourceMode === 'ai' && (
              <Input label="What should the video be about?" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="e.g. How JobIntel 360 helps job seekers beat ghost jobs" />
            )}
            {sourceMode === 'document' && (
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Upload a document</label>
                <label className="cursor-pointer border-2 border-dashed border-slate-300 rounded-lg px-4 py-6 flex flex-col items-center gap-2 text-slate-500 hover:bg-slate-50 transition-colors">
                  <Upload size={22} />
                  <span className="text-sm font-medium">{docFile ? docFile.name : 'Click to upload PDF, Word, or text'}</span>
                  <input type="file" accept=".pdf,.doc,.docx,.txt,.md" className="hidden" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            )}
            {sourceMode === 'url' && (
              <Input label="Website URL" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://example.com/product" />
            )}

            <TextArea
              label="Focus instructions (optional)"
              rows={2}
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="Tell the AI what to emphasize or skip — e.g. 'focus on pricing and benefits, skip the team bios'."
            />

            {sourceMode !== 'write' && (
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Video length</label>
                <select
                  value={videoLength}
                  onChange={(e) => setVideoLength(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                >
                  {LENGTHS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  The scriptwriter sizes the narration to this. You can still edit the script before scenes are built.
                </p>
              </div>
            )}

            {(sourceMode === 'url' || sourceMode === 'document') && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mirrorTheme}
                  onChange={(e) => setMirrorTheme(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-sm font-bold text-slate-700">Mirror the source&rsquo;s theme</span>
                  <span className="block text-xs text-slate-400">
                    Read the {sourceMode === 'url' ? "site's" : "PDF's"} real colors, fonts &amp; style and apply them to the video
                    {sourceMode === 'document' ? ' (PDFs only)' : ''}.
                  </span>
                </span>
              </label>
            )}
          </section>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button onClick={buildScript} disabled={sourceBusy} icon={sourceBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}>
              {sourceBusy ? 'Reading content…' : sourceMode === 'write' ? 'Review my script' : 'Write the script'}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2 — SCRIPT (Stage 1: the full narration, reviewed before scenes) */}
      {step === 'script' && (
        <div className="space-y-5">
          {scriptBusy ? (
            <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
              <Loader2 size={40} className="animate-spin text-indigo-600 mx-auto mb-4" />
              <p className="font-bold text-slate-700">Reading your content and writing the full script…</p>
              <p className="text-sm text-slate-400 mt-1">The AI reads everything first, then writes the complete narration — before any scenes exist.</p>
            </div>
          ) : (
            <>
              <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-700">Your video script</h3>
                  {fullScript.trim() && (
                    <span className="text-xs text-slate-400">
                      {fullScript.trim().split(/\s+/).length} words · ~{Math.max(1, Math.round(fullScript.trim().split(/\s+/).length / 150))} min
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">
                  This is the complete narration — exactly what the voiceover will say. Read it,
                  edit anything you like, and only then turn it into scenes. The scenes reuse
                  this script word-for-word, so get it right here first.
                </p>
                <TextArea
                  rows={16}
                  value={fullScript}
                  onChange={(e) => setFullScript(e.target.value)}
                  placeholder="Your full narration script…"
                />
                {scriptProvider && scriptProvider !== 'you' && (
                  <p className="text-xs text-slate-400">
                    Drafted by {scriptProvider === 'openai' ? 'GPT-4o' : scriptProvider === 'gemini' ? 'Gemini' : scriptProvider}. Edit freely before continuing.
                  </p>
                )}
              </section>

              <div className="flex justify-between gap-3">
                <Button variant="secondary" onClick={() => setStep('source')} icon={<ChevronLeft size={16} />}>Back</Button>
                <div className="flex gap-3">
                  {sourceMode !== 'write' && (
                    <Button variant="secondary" onClick={buildScript} icon={<Wand2 size={14} />}>Rewrite script</Button>
                  )}
                  <Button onClick={buildScenes} icon={<ChevronRight size={16} />}>Generate scenes</Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 3 — SCENES */}
      {step === 'scenes' && (
        <div className="space-y-5">
          {scenesBusy ? (
            <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
              <Loader2 size={40} className="animate-spin text-indigo-600 mx-auto mb-4" />
              <p className="font-bold text-slate-700">The AI Scene Director is building your scenes…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-700">{scenes.length} scenes — edit anything you like</h3>
                <Button size="sm" variant="secondary" onClick={buildScenes} icon={<Wand2 size={14} />}>Regenerate</Button>
              </div>
              <div className="space-y-3">
                {scenes.map((scene, i) => (
                  <SceneCard
                    key={i}
                    scene={scene}
                    index={i}
                    total={scenes.length}
                    siteImages={siteImages}
                    onChange={(patch) => updateScene(i, patch)}
                    onMove={(dir) => moveScene(i, dir)}
                    onDelete={() => setScenes((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                ))}
              </div>

              {/* Add a scene of any type */}
              <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-sm font-bold text-slate-600 mr-1">Add scene:</span>
                {Object.keys(SCENE_DEFAULTS).map((t) => (
                  <button
                    key={t}
                    onClick={() => setScenes((prev) => [...prev, SCENE_DEFAULTS[t]()])}
                    className="text-xs font-bold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-2.5 py-1.5 rounded-md flex items-center gap-1"
                  >
                    <Plus size={12} /> {SCENE_LABEL[t]}
                  </button>
                ))}
              </div>

              <div className="flex justify-between gap-3">
                <Button variant="secondary" onClick={() => setStep('script')} icon={<ChevronLeft size={16} />}>Back to script</Button>
                <Button onClick={() => setStep('style')} icon={<ChevronRight size={16} />}>Continue to Style</Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 4 — STYLE */}
      {step === 'style' && (
        <div className="space-y-5">
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="font-bold text-slate-700">Brand</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Company / brand name" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Logo (optional)</label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer border-2 border-dashed border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 flex items-center gap-2">
                    {logoUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    {logoUploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo image'}
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={logoUploading} />
                  </label>
                  {logoUrl && (
                    <div className="flex items-center gap-2">
                      <img src={logoUrl} alt="logo" className="h-10 w-auto max-w-[80px] object-contain border border-slate-200 rounded bg-white p-1" />
                      <button onClick={() => setLogoUrl('')} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Primary color</label>
                <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="w-full h-10 rounded border border-slate-300" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Accent color</label>
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-full h-10 rounded border border-slate-300" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Tone</label>
              <select value={tone} onChange={(e) => setTone(e.target.value as any)} className="w-full border border-slate-300 rounded-lg p-2">
                <option value="bold">Bold — punchy, energetic</option>
                <option value="calm">Calm — gentle, smooth</option>
                <option value="corporate">Corporate — crisp, professional</option>
              </select>
            </div>

            {themePalette && (
              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 mb-2">
                  <Sparkles size={13} /> Theme mirrored from your {sourceMode === 'document' ? 'PDF' : 'site'}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex gap-1">
                    {[primary, accent, themePalette.ink, themePalette.muted, themePalette.background, themePalette.panel, themePalette.danger]
                      .filter(Boolean)
                      .map((c, i) => (
                        <div
                          key={i}
                          className="w-6 h-6 rounded border border-slate-300"
                          style={{ backgroundColor: c as string }}
                          title={c as string}
                        />
                      ))}
                  </div>
                  {themePalette.headingFont && (
                    <span className="text-xs text-slate-500">
                      Font: <span className="font-bold text-slate-700">{themePalette.headingFont}</span>
                    </span>
                  )}
                  {themeScreenshot && (
                    <img src={themeScreenshot} alt="source" className="h-10 rounded border border-slate-200" />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Primary, accent &amp; tone above are editable; the rest of the palette and the font are applied automatically.
                </p>
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="font-bold text-slate-700">Voice &amp; music</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Narration voice</label>
                <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2">
                  {VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <div className="mt-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Speaking speed — {voiceSpeed.toFixed(2)}×
                  </label>
                  <input
                    type="range"
                    min={0.7}
                    max={1.3}
                    step={0.05}
                    value={voiceSpeed}
                    onChange={(e) => setVoiceSpeed(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Background music</label>
                <div className="flex gap-2">
                  <select value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)} className="flex-1 border border-slate-300 rounded-lg p-2">
                    {MUSIC.map((m) => <option key={m.label} value={m.url}>{m.label}</option>)}
                    {uploadedMusic.length > 0 && (
                      <optgroup label="Added tracks">
                        {uploadedMusic.map((m) => <option key={m.url} value={m.url}>{m.label}</option>)}
                      </optgroup>
                    )}
                  </select>
                  {musicUrl && (
                    <button onClick={() => previewMusic()} className="px-3 border border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50" title="Preview"><Play size={16} /></button>
                  )}
                </div>
                <label className="mt-2 cursor-pointer inline-flex items-center gap-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1.5 rounded">
                  {musicBusy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {musicBusy ? 'Uploading…' : 'Upload your own track (MP3, WAV…)'}
                  <input type="file" accept="audio/*" className="hidden" onChange={handleMusicUpload} disabled={musicBusy} />
                </label>

                {/* Search an open music library */}
                <div className="flex gap-2 mt-2">
                  <input
                    value={musicQuery}
                    onChange={(e) => setMusicQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') searchMusic(); }}
                    placeholder="Search music — e.g. 'upbeat corporate', 'cinematic'"
                    className="flex-1 border border-slate-300 rounded-lg p-2 text-sm"
                  />
                  <button onClick={searchMusic} disabled={musicSearching} className="px-3 bg-indigo-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                    {musicSearching ? '…' : 'Search'}
                  </button>
                </div>
                {musicResults.length > 0 && (
                  <div className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {musicResults.map((t) => (
                      <div key={t.url} className="flex items-center gap-2 p-2 text-sm">
                        <button onClick={() => previewMusic(t.url)} className="text-slate-400 hover:text-indigo-600 shrink-0" title="Preview"><Play size={14} /></button>
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium text-slate-700">{t.title}</div>
                          <div className="truncate text-xs text-slate-400">
                            {t.artist || 'Unknown'} · {t.license || 'see source'}{t.duration ? ` · ${fmtDur(t.duration)}` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => useTrack(t)}
                          className={`shrink-0 text-xs font-bold px-2 py-1 rounded ${musicUrl === t.url ? 'bg-green-100 text-green-700' : 'text-indigo-600 border border-indigo-200 hover:bg-indigo-50'}`}
                        >
                          {musicUrl === t.url ? 'Selected' : 'Use'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  Search results come from open music libraries — licenses vary and are shown per track.
                </p>
              </div>
            </div>
            {musicUrl && (
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Music mode</label>
                <select value={musicMode} onChange={(e) => setMusicMode(e.target.value as any)} className="w-full border border-slate-300 rounded-lg p-2">
                  <option value="continuous">Continuous — low bed throughout</option>
                  <option value="introOutro">Intro / outro — louder at start &amp; end</option>
                </select>
              </div>
            )}
          </section>

          <div className="flex justify-between gap-3">
            <Button variant="secondary" onClick={() => setStep('scenes')} icon={<ChevronLeft size={16} />}>Back</Button>
            <Button onClick={startRender} icon={<Sparkles size={16} />}>Render motion video</Button>
          </div>
        </div>
      )}
    </div>
  );
};
