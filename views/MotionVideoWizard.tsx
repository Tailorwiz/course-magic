/**
 * MotionVideoWizard — the Motion Video builder (Phase 2a).
 *
 * A dedicated view for creating brand-aware motion-graphics videos with the
 * Remotion engine. The user sets a brand kit, picks a voice + music, edits a
 * starter set of scenes, then renders server-side via /api/motion/render and
 * polls /api/motion/render/:jobId.
 *
 * Phase 2c will add the AI Scene Director (script -> scenes); for now the
 * scene list starts from an editable template.
 */
import React, { useState, useRef } from 'react';
import { apiFetch } from '../api';
import { Button } from '../components/Button';
import { Input, TextArea } from '../components/Input';
import {
  Sparkles, Loader2, Film, Play, Download, Plus, Trash2, ChevronLeft,
} from 'lucide-react';

interface MotionVideoWizardProps {
  onCancel: () => void;
}

// --- Voice + music options ---
// Voices: Kokoro (free, open-source, self-hosted TTS — same engine as the
// audiobook app). Music: SoundHelix tracks.

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

// --- Scene model (mirrors motion/src/scenes.ts) -----------------------------

type Scene =
  | { type: 'kineticTitle'; narration: string; lines: { text: string; accent?: string }[]; showLogo?: boolean; durationInFrames: number }
  | { type: 'flowchart'; narration: string; topTag?: string; steps: { text: string; bad?: boolean }[]; durationInFrames: number }
  | { type: 'bulletBuild'; narration: string; title: string; bullets: string[]; durationInFrames: number };

const STARTER_SCENES: Scene[] = [
  {
    type: 'kineticTitle',
    durationInFrames: 90,
    showLogo: false,
    narration: 'Most explainer videos lose people in the first ninety seconds.',
    lines: [{ text: 'Most explainer videos' }, { text: 'lose people in 90 seconds', accent: '90 seconds' }],
  },
  {
    type: 'flowchart',
    durationInFrames: 120,
    narration: 'Static slides make attention drop, and then nobody finishes.',
    topTag: 'Viewers stop watching',
    steps: [{ text: 'Static slides' }, { text: 'Attention drops' }, { text: 'Nobody finishes', bad: true }],
  },
  {
    type: 'bulletBuild',
    durationInFrames: 120,
    narration: 'Motion video fixes that — animated, on-brand, built from your script.',
    title: 'Motion video fixes that',
    bullets: ['Animated scenes, not static slides', 'On-brand for every client', 'Built straight from your script'],
  },
];

export const MotionVideoWizard: React.FC<MotionVideoWizardProps> = ({ onCancel }) => {
  // Brand kit
  const [brandName, setBrandName] = useState('Course Magic');
  const [primary, setPrimary] = useState('#4f46e5');
  const [accent, setAccent] = useState('#ff5a1f');
  const [tone, setTone] = useState<'bold' | 'calm' | 'corporate'>('bold');
  const [logoUrl, setLogoUrl] = useState('');

  // Voice + music
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [musicUrl, setMusicUrl] = useState(MUSIC[1].url);
  const [musicMode, setMusicMode] = useState<'continuous' | 'introOutro'>('continuous');

  // Scenes
  const [scenes, setScenes] = useState<Scene[]>(STARTER_SCENES);

  // Render state
  const [step, setStep] = useState<'setup' | 'rendering' | 'done'>('setup');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateScene = (i: number, patch: Partial<Scene>) => {
    setScenes((prev) => prev.map((s, idx) => (idx === i ? ({ ...s, ...patch } as Scene) : s)));
  };

  const startRender = async () => {
    setError('');
    setProgress(0);
    setStage('starting');
    setStep('rendering');
    try {
      const brand = { name: brandName, primary, accent, tone, logoUrl: logoUrl || undefined };
      const resp = await apiFetch('/api/motion/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes,
          brand,
          voiceId,
          music: { url: musicUrl || undefined, mode: musicMode },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to start render');

      const jobId = data.jobId;
      pollRef.current = setInterval(async () => {
        try {
          const s = await apiFetch(`/api/motion/render/${jobId}`).then((r) => r.json());
          setProgress(s.progress || 0);
          setStage(s.stage || s.status || '');
          if (s.status === 'done') {
            if (pollRef.current) clearInterval(pollRef.current);
            setVideoUrl(s.videoUrl);
            setStep('done');
          } else if (s.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(s.error || 'Render failed');
            setStep('setup');
          }
        } catch {
          /* transient poll error — keep polling */
        }
      }, 2500);
    } catch (e: any) {
      setError(e?.message || 'Render failed');
      setStep('setup');
    }
  };

  // --- Rendering state -----------------------------------------------------
  if (step === 'rendering') {
    return (
      <div className="max-w-2xl mx-auto py-20 px-6 text-center">
        <Loader2 size={48} className="animate-spin text-indigo-600 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Rendering your motion video…</h2>
        <p className="text-slate-500 mb-6 capitalize">
          {stage === 'tts' ? 'Generating narration' : stage === 'bundle' ? 'Preparing engine' : stage === 'render' ? 'Animating scenes' : stage === 'uploading' ? 'Saving video' : stage}
        </p>
        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
          <div className="bg-indigo-600 h-full transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="text-sm text-slate-400 mt-3">{Math.round(progress * 100)}%</p>
      </div>
    );
  }

  // --- Done state ----------------------------------------------------------
  if (step === 'done') {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Film className="text-indigo-600" /> Your motion video is ready
        </h2>
        <video src={videoUrl} controls className="w-full rounded-xl shadow-lg bg-black" />
        <div className="flex gap-3 mt-6">
          <Button onClick={() => window.open(videoUrl, '_blank')} icon={<Download size={16} />}>Download MP4</Button>
          <Button variant="secondary" onClick={() => setStep('setup')} icon={<ChevronLeft size={16} />}>Edit & re-render</Button>
          <Button variant="secondary" onClick={onCancel}>Done</Button>
        </div>
      </div>
    );
  }

  // --- Setup state ---------------------------------------------------------
  return (
    <div className="max-w-4xl mx-auto py-8 px-6 space-y-8">
      <div className="flex items-center gap-3">
        <Film className="text-indigo-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Motion Video</h1>
          <p className="text-slate-500 text-sm">Brand-aware animated explainer videos.</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {/* Brand */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="font-bold text-slate-700">Brand</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Company / brand name" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          <Input label="Logo URL (optional)" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" />
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
      </section>

      {/* Voice + music */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="font-bold text-slate-700">Voice &amp; music</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Narration voice</label>
            <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2">
              {VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Background music</label>
            <select value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2">
              {MUSIC.map((m) => <option key={m.label} value={m.url}>{m.label}</option>)}
            </select>
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

      {/* Scenes */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="font-bold text-slate-700">Scenes</h3>
        <p className="text-xs text-slate-500">Each scene's length is set automatically from its narration.</p>
        {scenes.map((scene, i) => (
          <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">{scene.type}</span>
              {scenes.length > 1 && (
                <button onClick={() => setScenes((p) => p.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <TextArea label="Narration (spoken)" rows={2} value={scene.narration} onChange={(e) => updateScene(i, { narration: e.target.value })} />
            {scene.type === 'kineticTitle' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label="Headline line 1" value={scene.lines[0]?.text || ''} onChange={(e) => updateScene(i, { lines: [{ text: e.target.value }, scene.lines[1] || { text: '' }] })} />
                <Input label="Headline line 2" value={scene.lines[1]?.text || ''} onChange={(e) => updateScene(i, { lines: [scene.lines[0] || { text: '' }, { text: e.target.value, accent: scene.lines[1]?.accent }] })} />
                <Input label="Accent word (in line 2)" value={scene.lines[1]?.accent || ''} onChange={(e) => updateScene(i, { lines: [scene.lines[0] || { text: '' }, { text: scene.lines[1]?.text || '', accent: e.target.value }] })} />
              </div>
            )}
            {scene.type === 'flowchart' && (
              <div className="space-y-2">
                <Input label="Top tag" value={scene.topTag || ''} onChange={(e) => updateScene(i, { topTag: e.target.value })} />
                {scene.steps.map((st, sIdx) => (
                  <Input key={sIdx} label={`Step ${sIdx + 1}`} value={st.text} onChange={(e) => updateScene(i, { steps: scene.steps.map((x, xi) => xi === sIdx ? { ...x, text: e.target.value } : x) })} />
                ))}
              </div>
            )}
            {scene.type === 'bulletBuild' && (
              <div className="space-y-2">
                <Input label="Title" value={scene.title} onChange={(e) => updateScene(i, { title: e.target.value })} />
                {scene.bullets.map((b, bIdx) => (
                  <Input key={bIdx} label={`Bullet ${bIdx + 1}`} value={b} onChange={(e) => updateScene(i, { bullets: scene.bullets.map((x, xi) => xi === bIdx ? e.target.value : x) })} />
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={startRender} icon={<Sparkles size={16} />}>Render motion video</Button>
      </div>
    </div>
  );
};
