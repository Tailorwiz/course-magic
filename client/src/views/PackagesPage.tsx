import React from 'react';

interface PackagesPageProps {
  onBack: () => void;
}

export default function PackagesPage({ onBack }: PackagesPageProps) {
  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ 
        background: 'linear-gradient(135deg, #0a0f1a 0%, #1a1f3c 50%, #0a0f1a 100%)'
      }}
    >
      <div className="max-w-5xl mx-auto text-center">
        <div className="flex flex-col items-center mb-6">
          <img 
            src="/media/images/marcus-hall.jpeg" 
            alt="Marcus Hall"
            className="w-72 h-72 md:w-88 md:h-88 rounded-full object-cover"
            style={{ border: '5px solid #D4AF37', objectPosition: 'center 20%', width: '280px', height: '280px' }}
          />
          <p 
            className="text-2xl md:text-3xl font-semibold mt-4"
            style={{ 
              fontFamily: "'Playfair Display', serif",
              color: '#D4AF37'
            }}
          >
            Marcus Hall
          </p>
        </div>

        <div 
          className="py-6 px-8 rounded-2xl mb-8"
          style={{ 
            background: 'linear-gradient(135deg, #0d1528 0%, #1a2744 50%, #0d1528 100%)',
            border: '2px solid rgba(212, 175, 55, 0.3)'
          }}
        >
          <h1 
            className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight"
            style={{ 
              fontFamily: "'Playfair Display', serif",
              color: '#FFFFFF'
            }}
          >
            Land Your Next $200K+ Role in Under 90 Days!
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <a
            href="https://calendly.com/resultsdrivenresumes/jod"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center justify-center p-8 rounded-2xl transition-all duration-300 hover:scale-105"
            style={{ 
              background: 'linear-gradient(135deg, #1a2744 0%, #0d1528 100%)',
              border: '2px solid #D4AF37'
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 30px rgba(212, 175, 55, 0.4)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
          >
            <svg className="w-16 h-16 mb-4" style={{ color: '#D4AF37' }} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <h3 
              className="text-xl font-bold mb-2"
              style={{ 
                fontFamily: "'Playfair Display', serif",
                color: '#D4AF37'
              }}
            >
              Book a Call with Marcus
            </h3>
            <p className="text-gray-400 text-sm text-center">
              Schedule a personalized consultation
            </p>
          </a>

          <a
            href="https://executivejobsondemand.com/masterclasses"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center justify-center p-8 rounded-2xl transition-all duration-300 hover:scale-105"
            style={{ 
              background: 'linear-gradient(135deg, #1a2744 0%, #0d1528 100%)',
              border: '2px solid #D4AF37'
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 30px rgba(212, 175, 55, 0.4)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
          >
            <svg className="w-16 h-16 mb-4" style={{ color: '#D4AF37' }} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
            </svg>
            <h3 
              className="text-xl font-bold mb-2"
              style={{ 
                fontFamily: "'Playfair Display', serif",
                color: '#D4AF37'
              }}
            >
              View Marcus's Masterclasses
            </h3>
            <p className="text-gray-400 text-sm text-center">
              Access premium training content
            </p>
          </a>

          <a
            href="https://executivejobsondemand.com/packages"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center justify-center p-8 rounded-2xl transition-all duration-300 hover:scale-105"
            style={{ 
              background: 'linear-gradient(135deg, #1a2744 0%, #0d1528 100%)',
              border: '2px solid #D4AF37'
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 30px rgba(212, 175, 55, 0.4)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
          >
            <svg className="w-16 h-16 mb-4" style={{ color: '#D4AF37' }} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            <h3 
              className="text-xl font-bold mb-2"
              style={{ 
                fontFamily: "'Playfair Display', serif",
                color: '#D4AF37'
              }}
            >
              View Executive Jobs on Demand Packages
            </h3>
            <p className="text-gray-400 text-sm text-center">
              Explore our comprehensive career packages
            </p>
          </a>
        </div>

        <a
          href="/media/Executive-Jobs-on-Demand-Quick-Program-Overview.pdf"
          download
          className="flex items-center justify-center gap-3 mx-auto px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105 mb-8"
          style={{ 
            background: 'linear-gradient(135deg, #D4AF37 0%, #C9A227 50%, #D4AF37 100%)',
            border: '2px solid #000000'
          }}
          onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 30px rgba(212, 175, 55, 0.5)'}
          onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
        >
          <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-lg font-bold text-black">Download Quick Program Overview (PDF)</span>
        </a>

        <button
          onClick={onBack}
          className="flex items-center gap-2 mx-auto px-6 py-3 rounded-xl transition-all duration-300 hover:scale-105"
          style={{ 
            background: 'linear-gradient(135deg, #2D3748 0%, #1A202C 100%)',
            border: '2px solid #FFFFFF'
          }}
          onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 20px rgba(100, 100, 100, 0.4)'}
          onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          <span className="text-white font-semibold">Back</span>
        </button>
      </div>
    </div>
  );
}
