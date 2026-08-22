
import React, { useRef, useState } from 'react';
import { Button } from '../components/Button';
import { Download, Upload, AlertTriangle, Database, Code, Copy, Check, Bot } from 'lucide-react';
import { importCourseFromZip } from '../utils';
import { Course } from '../types';

interface SettingsViewProps {
    onExportAll: () => void;
    onImportAll: (file: File) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onExportAll, onImportAll }) => {
    const importRef = useRef<HTMLInputElement>(null);
    const codeGenRef = useRef<HTMLInputElement>(null);
    const [generatedCode, setGeneratedCode] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);

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
                {/* AI Engines — fixed server-side, nothing to configure */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="p-6 border-b border-slate-100">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Bot size={20} className="text-purple-600"/> AI Engines</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            AI is configured on the server — there is nothing to set up here.
                        </p>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Writing, analysis &amp; storyboards</div>
                            <div className="text-md font-bold text-slate-900">Claude (Anthropic)</div>
                            <p className="text-xs text-slate-500 mt-1">Scripts, scene direction, document reading, metadata, takeaways.</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Images &amp; covers</div>
                            <div className="text-md font-bold text-slate-900">GPT Image 2 (OpenAI)</div>
                            <p className="text-xs text-slate-500 mt-1">Video visuals and book covers, generated at high quality.</p>
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
