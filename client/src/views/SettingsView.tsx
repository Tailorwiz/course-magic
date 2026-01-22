import React, { useRef, useState, useEffect } from 'react';
import { Button } from '../components/Button';
import { Download, Upload, AlertTriangle, Database, Info, Code, Copy, Check, Bot, Key, Eye, EyeOff, Save, Loader2, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { importCourseFromZip } from '../utils';
import { Course } from '../types';
import { api } from '../api';

const AI_MODELS = [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Fastest, good quality' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Higher quality, slower' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', desc: 'Ultra-fast, high volume' },
];

interface SettingsViewProps {
    onExportAll: () => void;
    onImportAll: (file: File) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onExportAll, onImportAll }) => {
    const importRef = useRef<HTMLInputElement>(null);
    const codeGenRef = useRef<HTMLInputElement>(null);
    const [generatedCode, setGeneratedCode] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);
    
    // AI Settings State
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [openaiApiKey, setOpenaiApiKey] = useState('');
    const [replicateApiKey, setReplicateApiKey] = useState('');
    const [defaultAIModel, setDefaultAIModel] = useState('gemini-2.5-flash');
    const [imageProvider, setImageProvider] = useState('auto');
    const [showApiKey, setShowApiKey] = useState(false);
    const [showOpenaiKey, setShowOpenaiKey] = useState(false);
    const [showReplicateKey, setShowReplicateKey] = useState(false);
    const [aiSettingsSaved, setAiSettingsSaved] = useState(false);
    const [testingFlux, setTestingFlux] = useState(false);
    const [fluxTestResult, setFluxTestResult] = useState<{success: boolean; message: string; imageData?: string} | null>(null);
    const [geminiMode, setGeminiMode] = useState<'free' | 'paid'>('paid');

    // Load saved AI settings on mount
    useEffect(() => {
        const savedApiKey = localStorage.getItem('geminiApiKey') || '';
        const savedOpenaiKey = localStorage.getItem('openaiApiKey') || '';
        const savedReplicateKey = localStorage.getItem('replicateApiKey') || '';
        const savedModel = localStorage.getItem('defaultAIModel') || 'gemini-2.5-flash';
        const savedImageProvider = localStorage.getItem('imageProvider') || 'auto';
        const savedGeminiMode = localStorage.getItem('geminiMode') || 'paid';
        setGeminiApiKey(savedApiKey);
        setOpenaiApiKey(savedOpenaiKey);
        setReplicateApiKey(savedReplicateKey);
        setDefaultAIModel(savedModel);
        setImageProvider(savedImageProvider);
        setGeminiMode(savedGeminiMode as 'free' | 'paid');
    }, []);

    const saveAISettings = () => {
        localStorage.getItem('geminiApiKey') !== geminiApiKey && localStorage.setItem('geminiApiKey', geminiApiKey);
        localStorage.setItem('openaiApiKey', openaiApiKey);
        localStorage.setItem('replicateApiKey', replicateApiKey);
        localStorage.setItem('defaultAIModel', defaultAIModel);
        localStorage.setItem('imageProvider', imageProvider);
        setAiSettingsSaved(true);
        setTimeout(() => setAiSettingsSaved(false), 2000);
    };

    const testFluxConnection = async () => {
        if (!replicateApiKey) {
            setFluxTestResult({ success: false, message: 'Please enter your Replicate API key first' });
            return;
        }
        setTestingFlux(true);
        setFluxTestResult(null);
        try {
            const response = await api.testFlux(replicateApiKey);
            if (response.success) {
                setFluxTestResult({ 
                    success: true, 
                    message: 'FLUX is working! Image generated successfully.',
                    imageData: response.imageData
                });
            } else {
                setFluxTestResult({ success: false, message: response.error || 'Test failed' });
            }
        } catch (error: any) {
            setFluxTestResult({ success: false, message: error?.message || 'Connection failed' });
        } finally {
            setTestingFlux(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onImportAll(e.target.files[0]);
        }
    };

    const handleCodeGen = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                let course: Course | null = null;
                if (file.name.endsWith('.zip')) {
                    course = await importCourseFromZip(file);
                } else {
                    const text = await file.text();
                    course = JSON.parse(text);
                }
                
                if (course) {
                    // Stringify with formatting
                    const json = JSON.stringify(course, null, 2);
                    const code = `export const MY_NEW_COURSE: Course = ${json};`;
                    setGeneratedCode(code);
                }
            } catch (err) {
                console.error(err);
                alert("Failed to parse course file. Ensure it is a valid export.");
            }
        }
        if (codeGenRef.current) codeGenRef.current.value = '';
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedCode);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">Global Settings</h1>
                <p className="text-slate-500">Manage application-wide configurations and data.</p>
            </div>
            
            <div className="space-y-8">
                {/* AI Configuration Section */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="p-6 border-b border-slate-100">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Bot size={20} className="text-purple-600"/> AI Configuration</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            Configure your AI settings for video generation. These settings persist until you change them.
                        </p>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        {/* Gemini API Key */}
                        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
                                    <Key size={20}/>
                                </div>
                                <div>
                                    <h3 className="text-md font-bold text-slate-900">Gemini API Key</h3>
                                    <p className="text-xs text-slate-500">Your own API key for AI generation (overrides default)</p>
                                </div>
                            </div>
                            <div className="flex gap-2 items-center">
                                <div className="relative flex-1">
                                    <input
                                        type={showApiKey ? "text" : "password"}
                                        value={geminiApiKey}
                                        onChange={(e) => setGeminiApiKey(e.target.value)}
                                        placeholder="Enter your Gemini API key..."
                                        className="w-full px-4 py-2.5 pr-10 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showApiKey ? <EyeOff size={18}/> : <Eye size={18}/>}
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 mt-2">
                                Leave empty to use the default API key from environment.
                            </p>
                        </div>

                        {/* OpenAI API Key */}
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border border-emerald-200">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-full flex items-center justify-center">
                                    <Key size={20}/>
                                </div>
                                <div>
                                    <h3 className="text-md font-bold text-slate-900">OpenAI API Key <span className="text-xs font-normal text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full ml-2">DALL-E 3</span></h3>
                                    <p className="text-xs text-slate-500">Your own OpenAI key for image generation (explanatory/illustrative style)</p>
                                </div>
                            </div>
                            <div className="flex gap-2 items-center">
                                <div className="relative flex-1">
                                    <input
                                        type={showOpenaiKey ? "text" : "password"}
                                        value={openaiApiKey}
                                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                                        placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                        className="w-full px-4 py-2.5 pr-10 border border-emerald-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showOpenaiKey ? <EyeOff size={18}/> : <Eye size={18}/>}
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-emerald-600 mt-2">
                                Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-800">platform.openai.com</a>. DALL-E 3 is great for explanatory/illustrative images.
                            </p>
                        </div>

                        {/* Replicate API Key for FLUX (Optional) */}
                        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center">
                                    <Key size={20}/>
                                </div>
                                <div>
                                    <h3 className="text-md font-bold text-slate-900">Replicate API Key <span className="text-xs font-normal text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full ml-2">Optional - FLUX</span></h3>
                                    <p className="text-xs text-slate-500">For photorealistic images (better for faces, corporate photos)</p>
                                </div>
                            </div>
                            <div className="flex gap-2 items-center">
                                <div className="relative flex-1">
                                    <input
                                        type={showReplicateKey ? "text" : "password"}
                                        value={replicateApiKey}
                                        onChange={(e) => setReplicateApiKey(e.target.value)}
                                        placeholder="r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                        className="w-full px-4 py-2.5 pr-10 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowReplicateKey(!showReplicateKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showReplicateKey ? <EyeOff size={18}/> : <Eye size={18}/>}
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 mt-3">
                                <button
                                    onClick={testFluxConnection}
                                    disabled={testingFlux || !replicateApiKey}
                                    className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {testingFlux ? <Loader2 size={16} className="animate-spin"/> : null}
                                    {testingFlux ? 'Testing...' : 'Test FLUX (1 image)'}
                                </button>
                                <p className="text-xs text-slate-500">
                                    Get your key at <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">replicate.com</a>
                                </p>
                            </div>
                            {fluxTestResult && (
                                <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 ${fluxTestResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                                    {fluxTestResult.success ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{fluxTestResult.message}</p>
                                        {fluxTestResult.success && fluxTestResult.imageData && (
                                            <img 
                                                src={`data:image/png;base64,${fluxTestResult.imageData}`} 
                                                alt="FLUX test" 
                                                className="mt-2 max-w-xs rounded-lg shadow-md"
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Image Provider Selection */}
                        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                    <Bot size={20}/>
                                </div>
                                <div>
                                    <h3 className="text-md font-bold text-slate-900">Image Generation Provider</h3>
                                    <p className="text-xs text-slate-500">Choose which AI generates your video visuals</p>
                                </div>
                            </div>
                            <select
                                value={imageProvider}
                                onChange={(e) => setImageProvider(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                            >
                                <option value="auto">Auto (Gemini → OpenAI fallback)</option>
                                <option value="gemini">Gemini Only</option>
                                <option value="openai">OpenAI DALL-E 3 (Your API key)</option>
                                <option value="nano-banana">Nano Banana Pro - Google Gemini (Replicate)</option>
                                <option value="flux-schnell">FLUX Schnell - CHEAP ~$0.003/image (Replicate)</option>
                                <option value="flux">FLUX Pro - Best quality ~$0.04/image (Replicate)</option>
                            </select>
                            <p className="text-xs text-slate-500 mt-2">
                                <strong>Auto:</strong> Tries Gemini first, then your OpenAI key as fallback.<br/>
                                <strong>Gemini:</strong> Fast, artistic style - good for explanatory images.<br/>
                                <strong>OpenAI:</strong> DALL-E 3 - excellent for illustrative/educational images.<br/>
                                <strong>Nano Banana Pro:</strong> Google's Gemini image model via Replicate - great text rendering!<br/>
                                <strong>FLUX Schnell:</strong> Fast & cheap (~$0.003/image) - 15x cheaper than Pro!<br/>
                                <strong>FLUX Pro:</strong> Best photorealistic quality (~$0.04/image).
                            </p>
                        </div>

                        {/* Gemini Account Mode */}
                        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                                    <Zap size={20}/>
                                </div>
                                <div>
                                    <h3 className="text-md font-bold text-slate-900">Gemini Account Mode</h3>
                                    <p className="text-xs text-slate-500">Controls image generation speed based on your Gemini plan</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        localStorage.setItem('geminiMode', 'free');
                                        setGeminiMode('free');
                                    }}
                                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                                        geminiMode === 'free' 
                                            ? 'border-blue-500 bg-blue-50 text-blue-700' 
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                    }`}
                                >
                                    <div className="font-semibold">Free Account</div>
                                    <div className="text-xs mt-1">1 image at a time (slower, avoids rate limits)</div>
                                </button>
                                <button
                                    onClick={() => {
                                        localStorage.setItem('geminiMode', 'paid');
                                        setGeminiMode('paid');
                                    }}
                                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                                        geminiMode === 'paid' 
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                    }`}
                                >
                                    <div className="font-semibold">Paid Account</div>
                                    <div className="text-xs mt-1">3 images at once (faster, higher limits)</div>
                                </button>
                            </div>
                            <p className="text-xs text-slate-500 mt-3">
                                Free Gemini accounts have strict rate limits. Use "Free Account" mode to generate images one at a time and avoid quota errors.
                            </p>
                        </div>

                        {/* Default AI Model */}
                        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                                    <Bot size={20}/>
                                </div>
                                <div>
                                    <h3 className="text-md font-bold text-slate-900">Default AI Model (Text)</h3>
                                    <p className="text-xs text-slate-500">Select the default model for content generation</p>
                                </div>
                            </div>
                            <select
                                value={defaultAIModel}
                                onChange={(e) => setDefaultAIModel(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                            >
                                {AI_MODELS.map(model => (
                                    <option key={model.id} value={model.id}>
                                        {model.label} - {model.desc}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Save Button */}
                        <div className="flex justify-end">
                            <Button 
                                onClick={saveAISettings}
                                className={aiSettingsSaved ? "bg-emerald-600" : ""}
                                icon={aiSettingsSaved ? <Check size={16}/> : <Save size={16}/>}
                            >
                                {aiSettingsSaved ? 'Settings Saved!' : 'Save AI Settings'}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Data Portability Section */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="p-6 border-b border-slate-100">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Database size={20} className="text-indigo-600"/> Data Portability</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            Backup your workspace or restore from a previous session.
                        </p>
                    </div>
                    
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* EXPORT CARD */}
                        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 flex flex-col items-start">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                                    <Download size={20}/>
                                </div>
                                <h3 className="text-md font-bold text-slate-900">Full Application Backup</h3>
                            </div>
                            <p className="text-xs text-slate-500 flex-1 mb-4">
                                Export all your courses, student data, progress, and settings into a single `.zip` file. Keep this file safe to restore your workspace anywhere.
                            </p>
                            <Button variant="outline" onClick={onExportAll} className="w-full">
                                Export All Data
                            </Button>
                        </div>

                        {/* IMPORT CARD */}
                        <div className="bg-red-50 p-6 rounded-lg border border-red-200 flex flex-col items-start">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
                                    <Upload size={20}/>
                                </div>
                                <h3 className="text-md font-bold text-slate-900">Restore from Backup</h3>
                            </div>
                             <div className="flex items-start gap-2 text-red-700 bg-red-100/50 p-3 rounded-md text-xs mb-4 border border-red-200/50">
                                <AlertTriangle size={24} className="flex-shrink-0 mt-0.5" />
                                <span>
                                    <span className="font-bold">Warning:</span> Importing a backup file will permanently overwrite all existing data in this browser.
                                </span>
                            </div>
                            <input type="file" ref={importRef} className="hidden" accept=".zip" onChange={handleFileSelect} />
                            <Button variant="danger" onClick={() => importRef.current?.click()} className="w-full">
                                Import & Overwrite Data
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Developer Tools Section */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="p-6 border-b border-slate-100">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Code size={20} className="text-emerald-600"/> Developer Tools</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            Tools for converting dynamic content into permanent source code.
                        </p>
                    </div>
                    <div className="p-6">
                        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <h3 className="text-md font-bold text-slate-900 mb-2">Course to Code Converter</h3>
                            <p className="text-xs text-slate-500 mb-4 max-w-2xl">
                                Upload an exported course (ZIP or JSON) to generate the TypeScript code needed to hardcode it into <code>constants.ts</code>. This allows you to make a course available by default without loading from a database.
                            </p>
                            
                            {!generatedCode ? (
                                <div>
                                    <input type="file" ref={codeGenRef} className="hidden" accept=".zip,.json" onChange={handleCodeGen} />
                                    <Button variant="outline" onClick={() => codeGenRef.current?.click()} icon={<Upload size={16} />}>
                                        Select Course File to Convert
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4 animate-fade-in">
                                    <div className="relative">
                                        <textarea 
                                            className="w-full h-96 p-4 text-xs font-mono bg-slate-900 text-green-400 rounded-lg focus:outline-none custom-scrollbar"
                                            readOnly
                                            value={generatedCode}
                                        />
                                        <div className="absolute top-4 right-4">
                                            <Button size="sm" onClick={copyToClipboard} className={copySuccess ? "bg-emerald-600" : ""} icon={copySuccess ? <Check size={14}/> : <Copy size={14}/>}>
                                                {copySuccess ? 'Copied!' : 'Copy Code'}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <p className="text-xs text-slate-500 italic">
                                            Paste this code into <code>constants.ts</code> or replace <code>MOCK_COURSE</code>.
                                        </p>
                                        <Button variant="outline" onClick={() => setGeneratedCode('')} size="sm">
                                            Clear / Convert Another
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
