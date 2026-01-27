import React from 'react';
import { ArrowLeft, ArrowRight, Play, Users, Award, TrendingUp } from 'lucide-react';

interface PromoPageProps {
  onBack: () => void;
  onShowPackages?: () => void;
}

const YOUTUBE_VIDEO_ID = '6SkRX2bvwf4';

export const PromoPage: React.FC<PromoPageProps> = ({ onBack, onShowPackages }) => {
  return (
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: '#1a1f3c' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .btn-gold { transition: all 0.3s ease; }
        .btn-gold:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(212, 175, 55, 0.4); }
        .stat-card {
          background: linear-gradient(180deg, rgba(26,31,60,1) 0%, rgba(20,25,50,1) 100%);
          border: 1px solid rgba(212, 175, 55, 0.3);
          transition: all 0.3s ease;
        }
        .stat-card:hover {
          transform: translateY(-3px);
          border-color: rgba(212, 175, 55, 0.6);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        }
        .stat-icon {
          background: rgba(212, 175, 55, 0.2);
        }
        .stat-number {
          color: #D4AF37;
        }
        .stat-label {
          color: #ffffff;
        }
        .video-container {
          position: relative;
          overflow: hidden;
          border-radius: 16px;
        }
      `}</style>

      <header className="w-full py-10 md:py-14 text-center relative" style={{ background: 'linear-gradient(180deg, rgba(26,31,60,1) 0%, rgba(20,25,50,1) 50%, rgba(15,20,40,1) 100%)' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center top, rgba(212, 175, 55, 0.08) 0%, transparent 60%)' }}></div>
        <div className="relative z-10">
          <div className="inline-block px-5 py-2 rounded-full text-xs font-bold tracking-widest mb-5" style={{ backgroundColor: 'rgba(212, 175, 55, 0.2)', color: '#D4AF37', border: '2px solid rgba(212, 175, 55, 0.4)' }}>
            THE NATION'S LEADING EXECUTIVE TRAINING
          </div>
          <h1 className="font-playfair text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-3">
            Executive Jobs on Demand <span style={{ color: '#D4AF37' }}>Academy</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-300 font-medium">Premium Masterclasses by Marcus Hall</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(212, 175, 55, 0.5) 50%, transparent 100%)' }}></div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="text-center mb-10">
          <div className="flex flex-wrap justify-center gap-5 md:gap-6">
            <div className="stat-card flex items-center gap-4 px-6 py-4 rounded-2xl cursor-default">
              <div className="stat-icon w-12 h-12 rounded-full flex items-center justify-center">
                <Users size={22} style={{ color: '#D4AF37' }} />
              </div>
              <div className="text-left">
                <p className="stat-number font-bold text-xl tracking-tight">2,400+</p>
                <p className="stat-label font-semibold text-xs uppercase tracking-wider">Executives Coached</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-4 px-6 py-4 rounded-2xl cursor-default">
              <div className="stat-icon w-12 h-12 rounded-full flex items-center justify-center">
                <Award size={22} style={{ color: '#D4AF37' }} />
              </div>
              <div className="text-left">
                <p className="stat-number font-bold text-xl tracking-tight">Featured In</p>
                <p className="stat-label font-semibold text-xs uppercase tracking-wider">Forbes & LinkedIn</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-4 px-6 py-4 rounded-2xl cursor-default">
              <div className="stat-icon w-12 h-12 rounded-full flex items-center justify-center">
                <Users size={22} style={{ color: '#D4AF37' }} />
              </div>
              <div className="text-left">
                <p className="stat-number font-bold text-xl tracking-tight">70K+</p>
                <p className="stat-label font-semibold text-xs uppercase tracking-wider">LinkedIn Followers</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-4 px-6 py-4 rounded-2xl cursor-default">
              <div className="stat-icon w-12 h-12 rounded-full flex items-center justify-center">
                <TrendingUp size={22} style={{ color: '#D4AF37' }} />
              </div>
              <div className="text-left">
                <p className="stat-number font-bold text-xl tracking-tight">2M+</p>
                <p className="stat-label font-semibold text-xs uppercase tracking-wider">Views/Month</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-4 px-6 py-4 rounded-2xl cursor-default">
              <div className="stat-icon w-12 h-12 rounded-full flex items-center justify-center">
                <TrendingUp size={22} style={{ color: '#D4AF37' }} />
              </div>
              <div className="text-left">
                <p className="stat-number font-bold text-xl tracking-tight">$200K-$500K+</p>
                <p className="stat-label font-semibold text-xs uppercase tracking-wider">Roles Placed</p>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-4xl mt-4">
          <div className="text-center mb-8">
            <h2 className="font-playfair text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2">
              How to Land Your Next
            </h2>
            <h2 className="font-playfair text-4xl md:text-5xl lg:text-6xl font-bold mb-2" style={{ color: '#D4AF37' }}>
              $200K-$500K+ Role
            </h2>
            <h2 className="font-playfair text-3xl md:text-4xl lg:text-5xl font-bold italic text-white">
              in under 60 Days!
            </h2>
            <p className="text-gray-300 text-base md:text-lg max-w-3xl mx-auto mt-4 leading-relaxed">
              Learn Why Executives Choose Marcus Hall & His Executive Jobs on Demand Program!
            </p>
          </div>

          <div className="video-container shadow-2xl" style={{ border: '3px solid #D4AF37' }}>
            <div className="w-full aspect-video">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?rel=0`}
                title="Why Executives Choose Marcus Hall"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                style={{ display: 'block' }}
              ></iframe>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6 mt-8">
            <button
              onClick={onShowPackages}
              className="group flex items-center justify-center gap-4 px-12 py-6 rounded-2xl transition-all duration-300 hover:scale-105"
              style={{ 
                background: 'linear-gradient(135deg, #D4AF37 0%, #C9A227 50%, #D4AF37 100%)',
                border: '2px solid #000000'
              }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.3), 0 10px 40px rgba(212, 175, 55, 0.6)'}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
            >
              <span className="text-xl md:text-2xl font-bold text-black tracking-tight">
                Ready to Land Your Next $200K-$500K+ Role in Under 90 Days?
              </span>
              <svg className="w-8 h-8 text-black group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
            </button>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://www.linkedin.com/in/resultsdrivenresumes"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 px-8 py-5 rounded-xl transition-all duration-300 hover:scale-105"
                style={{ 
                  background: 'linear-gradient(135deg, #0A66C2 0%, #004182 100%)',
                  border: '2px solid #FFFFFF'
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.2), 0 8px 30px rgba(10, 102, 194, 0.6)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
              >
                <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                <div className="flex flex-col items-start">
                  <span className="text-white text-lg font-bold">Join 70,000+ Professionals</span>
                  <span className="text-blue-200 text-sm">Who Follow Marcus on LinkedIn</span>
                </div>
                <svg className="w-7 h-7 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.996.996 0 00-1.41 0L1.29 18.96a.996.996 0 000 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05a.996.996 0 000-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z"/>
                </svg>
              </a>

              <button
                onClick={onBack}
                className="group flex items-center gap-4 px-8 py-5 rounded-xl transition-all duration-300 hover:scale-105"
                style={{ 
                  background: 'linear-gradient(135deg, #2D3748 0%, #1A202C 100%)',
                  border: '2px solid #FFFFFF'
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.2), 0 8px 30px rgba(100, 100, 100, 0.4)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
              >
                <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <div className="flex flex-col items-start">
                  <span className="text-white text-lg font-bold">Member's Login</span>
                  <span className="text-gray-400 text-sm">Access Your Courses</span>
                </div>
                <svg className="w-7 h-7 text-gray-400 group-hover:text-white group-hover:scale-110 transition-all" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full mt-10 mb-3 px-0">
        <div className="h-px w-full" style={{ backgroundColor: '#D4AF37', opacity: 0.5 }}></div>
      </div>

      <footer className="pt-2 pb-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
            <p className="text-gray-500">© 2025 Executive Jobs on Demand. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-gray-400 hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">Terms of Service</a>
              <a href="mailto:support@executivejobsondemand.com" className="text-gray-400 hover:text-white transition-colors">Contact Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
