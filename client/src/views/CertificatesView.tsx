import React, { useState } from 'react';
import { Certificate, User } from '../types';
import { Award, Calendar, Eye, X, Printer } from 'lucide-react';
import { Button } from '../components/Button';
import { CertificateTemplate } from '../components/CertificateTemplate';

interface CertificatesViewProps {
  certificates: Certificate[];
  currentUser: User;
  onBack?: () => void;
}

export const CertificatesView: React.FC<CertificatesViewProps> = ({ certificates, currentUser, onBack }) => {
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);

  const displayCertificates = certificates;

  const handlePrint = () => {
    const certContent = document.getElementById('certificate-render-target');
    if (!certContent) return;
    
    // Open a new window for clean printing
    const printWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!printWindow) {
        alert("Please allow popups to download the certificate.");
        return;
    }

    // We clone the template HTML to inject into the print window
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Certificate - ${selectedCertificate?.courseTitle}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
          <style>
            @page { size: landscape; margin: 0; }
            body { 
                margin: 0; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                background: white;
            }
            .certificate-template {
                transform: scale(1);
                box-shadow: none !important;
            }
          </style>
        </head>
        <body>
          ${certContent.outerHTML}
          <script>
            window.onload = () => {
                setTimeout(() => {
                    window.print();
                }, 800);
            };
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">My Certificates</h1>
        <p className="text-slate-500">View and download your earned credentials.</p>
      </div>

      {certificates.length === 0 && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 mb-8 flex items-start gap-4">
              <div className="bg-indigo-100 p-2 rounded-full text-indigo-600 mt-1">
                  <Award size={24} />
              </div>
              <div>
                  <h3 className="text-indigo-900 font-bold text-lg">No Certificates Earned Yet</h3>
                  <p className="text-indigo-700 mt-1">Complete all lessons in a course to automatically generate your certificate.</p>
              </div>
          </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayCertificates.map((cert) => (
          <div key={cert.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
            {/* Certificate Preview Card */}
            <div className="bg-slate-100 p-8 flex items-center justify-center relative h-48 overflow-hidden">
                <div className="absolute inset-0 bg-white opacity-50"></div>
                <div className="w-full h-full border-4 border-double border-yellow-500/30 bg-white p-4 flex flex-col items-center justify-center text-center relative shadow-sm transform group-hover:scale-105 transition-transform duration-500">
                    <Award className="text-yellow-500 mb-2 opacity-50" size={32} />
                    <div className="text-[10px] font-serif uppercase tracking-widest text-slate-400 mb-1">Certificate of Completion</div>
                    <div className="font-serif font-bold text-slate-800 leading-tight line-clamp-2">{cert.courseTitle}</div>
                </div>
            </div>

            <div className="p-5">
              <h3 className="font-bold text-slate-900 line-clamp-1 mb-1">{cert.courseTitle}</h3>
              <div className="text-sm text-slate-500 flex items-center gap-2 mb-4">
                  <Calendar size={14} /> Issued: {new Date(cert.issueDate).toLocaleDateString()}
              </div>
              
              <Button 
                onClick={() => setSelectedCertificate(cert)} 
                className="w-full"
                icon={<Eye size={16} />}
              >
                View Certificate
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* CERTIFICATE MODAL */}
      {selectedCertificate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-hidden animate-fade-in">
           <div className="w-full max-w-[95vw] h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden animate-slide-up flex flex-col md:flex-row relative">
               
               <button onClick={() => setSelectedCertificate(null)} className="absolute top-4 right-4 z-50 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 md:hidden">
                   <X size={24} />
               </button>

               {/* Sidebar Controls */}
               <div className="w-full md:w-80 bg-slate-50 border-r border-slate-200 p-6 flex flex-col flex-shrink-0 h-full overflow-y-auto">
                   <div className="mb-6">
                       <h2 className="text-xl font-bold text-slate-900 mb-2">Certificate Details</h2>
                       <p className="text-slate-500 text-sm">Official credential of completion.</p>
                   </div>

                   <div className="space-y-4 mb-auto">
                       <div className="bg-white p-4 rounded-lg border border-slate-200">
                           <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Student</label>
                           <div className="font-medium text-slate-900">{selectedCertificate.studentName}</div>
                       </div>
                       <div className="bg-white p-4 rounded-lg border border-slate-200">
                           <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Course</label>
                           <div className="font-medium text-slate-900 leading-snug">{selectedCertificate.courseTitle}</div>
                       </div>
                       <div className="bg-white p-4 rounded-lg border border-slate-200">
                           <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Issue Date</label>
                           <div className="font-medium text-slate-900">{new Date(selectedCertificate.issueDate).toLocaleDateString()}</div>
                       </div>
                       <div className="bg-white p-4 rounded-lg border border-slate-200">
                           <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Certificate ID</label>
                           <div className="font-mono text-xs text-slate-500 break-all">{selectedCertificate.id}</div>
                       </div>
                   </div>

                   <div className="mt-6 space-y-3 pt-6 border-t border-slate-200">
                       <Button onClick={handlePrint} className="w-full" icon={<Printer size={16} />}>
                           Print / Download PDF
                       </Button>
                       <Button variant="outline" onClick={() => setSelectedCertificate(null)} className="w-full">
                           Close
                       </Button>
                   </div>
               </div>

               {/* Certificate Render Target */}
               <div className="flex-1 bg-slate-200 p-8 overflow-auto flex items-center justify-center relative">
                   {/* We render the template component here */}
                   <div className="transform scale-[0.55] md:scale-[0.85] origin-center shadow-2xl">
                       <CertificateTemplate 
                            id="certificate-render-target"
                            studentName={selectedCertificate.studentName}
                            courseTitle={selectedCertificate.courseTitle}
                            issueDate={selectedCertificate.issueDate}
                            certificateId={selectedCertificate.id}
                       />
                   </div>
               </div>
           </div>
        </div>
      )}
      
      <div className="md:hidden mt-8 pb-8 text-center">
           <button onClick={onBack} className="text-indigo-600 font-bold text-sm">
               ← Back to Dashboard
           </button>
       </div>
    </div>
  );
};
