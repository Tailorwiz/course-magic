
import React from 'react';
import { Award } from 'lucide-react';

interface CertificateTemplateProps {
    studentName: string;
    courseTitle: string;
    issueDate: string;
    instructorName?: string;
    certificateId?: string;
    id?: string;
    className?: string;
}

export const CertificateTemplate: React.FC<CertificateTemplateProps> = ({ 
    studentName, 
    courseTitle, 
    issueDate, 
    instructorName = "Executive Jobs on Demand", 
    certificateId,
    id,
    className = ""
}) => {
    return (
        <div id={id} className={`certificate-template w-[11in] h-[8.5in] bg-white text-slate-900 relative flex flex-col items-center justify-between p-12 border-[20px] border-double border-slate-100 shadow-2xl overflow-hidden flex-shrink-0 mx-auto select-none ${className}`}>
            
            {/* Background Texture & Gradient */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-50/30 via-white to-white pointer-events-none"></div>
            
            {/* Inner Border Frame */}
            <div className="absolute inset-6 border-[3px] border-slate-900 opacity-80 pointer-events-none"></div>
            <div className="absolute inset-8 border border-yellow-600 opacity-60 pointer-events-none"></div>

            {/* Corner Ornaments */}
            <div className="absolute top-6 left-6 w-32 h-32 border-t-[4px] border-l-[4px] border-slate-900 pointer-events-none"></div>
            <div className="absolute top-6 right-6 w-32 h-32 border-t-[4px] border-r-[4px] border-slate-900 pointer-events-none"></div>
            <div className="absolute bottom-6 left-6 w-32 h-32 border-b-[4px] border-l-[4px] border-slate-900 pointer-events-none"></div>
            <div className="absolute bottom-6 right-6 w-32 h-32 border-b-[4px] border-r-[4px] border-slate-900 pointer-events-none"></div>

            {/* Content Container */}
            <div className="relative z-10 text-center flex flex-col items-center w-full h-full pt-8">
                
                {/* Header */}
                <div className="flex flex-col items-center mb-8">
                    <div className="flex items-center gap-4 mb-4 opacity-90">
                        <Award className="text-yellow-600" size={24} />
                        <span className="text-xs font-bold tracking-[0.4em] uppercase text-yellow-800">Professional Certification</span>
                        <Award className="text-yellow-600" size={24} />
                    </div>
                    <h1 className="text-6xl font-serif font-bold text-slate-900 uppercase tracking-[0.15em] mb-2 leading-none drop-shadow-sm" style={{ fontFamily: "serif" }}>Certificate</h1>
                    <p className="text-3xl font-serif italic text-slate-500 tracking-wide" style={{ fontFamily: "serif" }}>of Completion</p>
                </div>

                {/* Body */}
                <div className="flex-1 flex flex-col items-center justify-center w-full space-y-8 -mt-8">
                    <div className="w-full">
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">This credential is proudly awarded to</p>
                        
                        <div className="relative py-2 px-12 max-w-4xl mx-auto">
                            <h2 className="text-6xl font-serif font-bold text-indigo-950 px-8 py-2 border-b border-slate-300 w-full text-center leading-tight min-h-[1.2em]" style={{ fontFamily: "serif" }}>
                                {studentName}
                            </h2>
                        </div>
                    </div>

                    <div className="w-full max-w-5xl">
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">For successful completion of the executive training program</p>
                        <h3 className="text-4xl font-bold text-slate-900 leading-tight px-8 font-serif">
                            {courseTitle}
                        </h3>
                    </div>
                </div>

                {/* Footer / Signatures */}
                <div className="w-full flex justify-between items-end px-12 pb-8 mt-auto relative">
                    
                    {/* Date (Left) */}
                    <div className="text-center flex flex-col items-center z-20">
                        <div className="text-xl font-bold text-slate-800 font-serif italic mb-2 min-h-[1.5em]">
                            {new Date(issueDate).toLocaleDateString()}
                        </div>
                        <div className="w-56 border-t-2 border-slate-400"></div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Date Issued</p>
                    </div>

                    {/* Seal (Center) - Anchored to bottom but sits behind text if screen is tight, z-index managed */}
                    <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/4 z-10 flex flex-col items-center">
                        <div className="w-40 h-40 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center text-white shadow-xl border-[6px] border-double border-white relative group">
                            <div className="absolute inset-1 border border-yellow-200 rounded-full opacity-50"></div>
                            <Award size={80} className="drop-shadow-md text-white" />
                        </div>
                        <div className="mt-4 text-[9px] uppercase font-bold text-yellow-800 tracking-widest bg-yellow-50/90 px-3 py-1 rounded-full border border-yellow-200 shadow-sm backdrop-blur-sm">
                            Official Verified Credential
                        </div>
                    </div>

                    {/* Signature (Right) */}
                    <div className="text-center flex flex-col items-center z-20">
                        <div className="font-serif italic text-3xl text-slate-900 mb-1 transform -rotate-2 select-none whitespace-nowrap min-h-[1.5em]" style={{ fontFamily: "cursive" }}>
                            {instructorName}
                        </div>
                        <div className="w-72 border-t-2 border-slate-400"></div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Authorized Signature</p>
                    </div>
                </div>

            </div>

            {/* Certificate ID - Moved to Bottom Right Corner */}
            {certificateId && (
                <div className="absolute bottom-3 right-8 text-[10px] font-mono text-slate-400 uppercase tracking-widest z-30 bg-white/80 px-2 py-1 rounded">
                    Certificate ID: <span className="text-slate-600 font-bold">{certificateId}</span>
                </div>
            )}
        </div>
    );
};
