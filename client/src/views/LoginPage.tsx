import React, { useState, useRef } from 'react';
import { ArrowRight, CheckCircle, Lock, Mail, AlertCircle, User, Phone, MapPin, UploadCloud, ArrowLeft, ChevronLeft, Shield, Users, Award, TrendingUp, Star } from 'lucide-react';
import { Button } from '../components/Button';
import { User as UserType, UserRole } from '../types';
const marcusPhoto = '/marcus-photo.jpg';

interface LoginPageProps {
  onLogin: (email: string, pass: string) => boolean;
  onRegister: (user: UserType) => void;
  onSwitchToAdmin: () => void;
  onShowPromo?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onRegister, onSwitchToAdmin, onShowPromo }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCity, setRegCity] = useState('');
  const [regState, setRegState] = useState('');
  const [regAvatar, setRegAvatar] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    setTimeout(() => {
        const success = onLogin(email, password);
        if (!success) {
            setError('Invalid credentials. Please try again.');
            setIsLoading(false);
        }
    }, 800);
  };

  const handleRegister = (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setError('');

      setTimeout(() => {
          if (!regName || !regEmail || !regPassword) {
              setError("Please fill in all required fields.");
              setIsLoading(false);
              return;
          }

          const newUser: UserType = {
              id: `u-${Date.now()}`,
              name: regName,
              email: regEmail,
              password: regPassword,
              phone: regPhone,
              city: regCity,
              state: regState,
              role: UserRole.STUDENT,
              avatarUrl: regAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(regName)}&background=random`,
              assignedCourseIds: []
          };

          onRegister(newUser);
          setIsLoading(false);
          setSuccessMsg("Account created successfully! Logging you in...");
          
          setTimeout(() => {
              onLogin(regEmail, regPassword);
          }, 1000);
      }, 1000);
  };

  const handleResetPassword = (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setTimeout(() => {
          setIsLoading(false);
          setSuccessMsg(`Password reset link sent to ${email}`);
          setTimeout(() => {
              setMode('login');
              setSuccessMsg('');
          }, 3000);
      }, 1000);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
          setRegAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: '#1a1f3c' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .btn-gold { transition: all 0.3s ease; }
        .btn-gold:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(212, 175, 55, 0.4); }
        .btn-outline:hover { background-color: #1a1f3c; color: white; }
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
          <p className="text-lg md:text-xl text-gray-300 font-medium">Premium Masterclass Access Portal</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(212, 175, 55, 0.5) 50%, transparent 100%)' }}></div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="text-center mb-10">
          <p className="text-gray-300 text-base md:text-lg max-w-4xl mx-auto mb-10 leading-relaxed px-4">
            Access ALL of Marcus Hall's exclusive masterclasses and learn the EXACT proven strategies<br />
            the top .1% of Executives use to land $200K–$500K+ roles in under 60 days.
          </p>

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

        <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-stretch mt-4">
          <div className="hidden md:block h-full">
            <div className="rounded-2xl overflow-hidden shadow-2xl h-full relative" style={{ border: '3px solid #D4AF37' }}>
              <img 
                src={marcusPhoto} 
                alt="Marcus Hall - Executive Coach" 
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
                <h3 className="font-playfair text-2xl font-bold text-white mb-1">Marcus Hall</h3>
                <p className="text-sm font-semibold mb-1" style={{ color: '#D4AF37' }}>#1 Executive Career Coach</p>
                <p className="text-white/90 text-sm mb-4">Helping Leaders Land $200K-$500K+ Roles</p>
                
                <div className="border-t border-white/20 pt-4">
                  <div className="flex gap-1 mb-2">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={14} fill="#D4AF37" color="#D4AF37" />
                    ))}
                  </div>
                  <p className="text-white/90 text-xs italic">"Marcus helped me land a $350K VP role in just 8 weeks. His strategies are game-changing."</p>
                  <p className="text-white/70 text-xs mt-1">— Sarah K., VP of Marketing</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl shadow-2xl overflow-hidden" style={{ border: '3px solid #D4AF37' }}>
            <div className="px-6 py-4" style={{ backgroundColor: '#1a1f3c' }}>
              <h3 className="text-xl font-bold text-white mb-1">
                {mode === 'login' ? 'Welcome Back' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
              </h3>
              <p className="text-sm" style={{ color: '#D4AF37' }}>
                {mode === 'login' ? 'Login to access your exclusive masterclass content' : mode === 'signup' ? 'Start your career transformation journey' : 'Enter your email to receive a reset link'}
              </p>
            </div>
            <div className="bg-white p-6 md:p-8">
            {mode === 'login' && (
              <>
                <div className="mb-5 p-3 rounded-lg" style={{ backgroundColor: '#f8f5eb' }}>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Members get access to:</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={14} style={{ color: '#D4AF37' }} />
                      <span className="text-xs text-gray-600">10+ exclusive video masterclasses</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle size={14} style={{ color: '#D4AF37' }} />
                      <span className="text-xs text-gray-600">Resume & LinkedIn optimization templates</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle size={14} style={{ color: '#D4AF37' }} />
                      <span className="text-xs text-gray-600">Interview scripts & salary negotiation guides</span>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 mb-4 border border-red-200">
                    <AlertCircle size={16} /> {error}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-gray-800 placeholder-gray-400"
                        placeholder="your.email@example.com"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-gray-800 placeholder-gray-400"
                        placeholder="Enter your password"
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit"
                    isLoading={isLoading}
                    className="btn-gold w-full py-3 font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg"
                    style={{ backgroundColor: '#D4AF37', color: '#1a1f3c' }}
                  >
                    Access Masterclasses
                  </Button>

                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Shield size={14} className="text-green-600" />
                    <span>Secure, encrypted login</span>
                  </div>

                  <div className="text-center text-sm text-gray-600">
                    Don't have an account?
                  </div>

                  <button 
                    type="button" 
                    onClick={() => setMode('signup')} 
                    className="btn-outline w-full py-3 font-bold rounded-lg border-2 transition-all"
                    style={{ borderColor: '#1a1f3c', color: '#1a1f3c' }}
                  >
                    Sign Up Now
                  </button>

                  <div className="text-center">
                    <button type="button" onClick={() => setMode('reset')} className="text-sm text-gray-500 hover:text-gray-700 hover:underline">
                      Forgot your password?
                    </button>
                  </div>
                </form>
              </>
            )}

            {mode === 'signup' && (
              <>
                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 mb-4 border border-red-200">
                    <AlertCircle size={16} /> {error}
                  </div>
                )}
                {successMsg && (
                  <div className="p-3 rounded-lg text-sm flex items-center gap-2 mb-4" style={{ backgroundColor: '#D4AF37', color: '#1a1f3c' }}>
                    <CheckCircle size={16} /> {successMsg}
                  </div>
                )}

                <form onSubmit={handleRegister} className="space-y-3">
                  <div className="flex justify-center mb-4">
                    <div 
                      className="w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center relative overflow-hidden group cursor-pointer transition-colors bg-gray-50"
                      style={{ borderColor: '#D4AF37' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {regAvatar ? (
                        <img src={regAvatar} className="w-full h-full object-cover" alt="Avatar" />
                      ) : (
                        <div className="text-center p-1">
                          <UploadCloud size={16} className="mx-auto" style={{ color: '#D4AF37' }} />
                          <span className="text-[9px]" style={{ color: '#D4AF37' }}>Photo</span>
                        </div>
                      )}
                      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input required type="text" value={regName} onChange={e => setRegName(e.target.value)} className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500" placeholder="John Doe" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input required type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500" placeholder="john@example.com" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input required type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500" placeholder="Create a password" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} className="w-full pl-8 pr-2 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500" placeholder="(555) 000-0000" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <div className="relative flex gap-1">
                        <div className="relative flex-1">
                          <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                          <input type="text" value={regCity} onChange={e => setRegCity(e.target.value)} className="w-full pl-6 pr-1 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none" placeholder="City" />
                        </div>
                        <input type="text" value={regState} onChange={e => setRegState(e.target.value)} className="w-10 px-1 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none text-center" placeholder="ST" maxLength={2} />
                      </div>
                    </div>
                  </div>

                  <Button 
                    type="submit"
                    isLoading={isLoading}
                    className="btn-gold w-full py-3 font-bold rounded-lg mt-2 shadow-lg"
                    style={{ backgroundColor: '#D4AF37', color: '#1a1f3c' }}
                  >
                    Create Account
                  </Button>

                  <div className="text-center">
                    <button type="button" onClick={() => setMode('login')} className="text-sm text-gray-500 hover:text-gray-700 hover:underline">
                      Already have an account? Log In
                    </button>
                  </div>
                </form>
              </>
            )}

            {mode === 'reset' && (
              <>
                {successMsg && (
                  <div className="p-3 rounded-lg text-sm flex items-center gap-2 mb-4" style={{ backgroundColor: '#D4AF37', color: '#1a1f3c' }}>
                    <CheckCircle size={16} /> {successMsg}
                  </div>
                )}

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-gray-800 placeholder-gray-400"
                        placeholder="your.email@example.com"
                        required
                      />
                    </div>
                  </div>
                  
                  <Button 
                    type="submit"
                    isLoading={isLoading}
                    className="btn-gold w-full py-3 font-bold rounded-lg shadow-lg"
                    style={{ backgroundColor: '#D4AF37', color: '#1a1f3c' }}
                  >
                    Send Reset Link
                  </Button>
                  
                  <div className="text-center">
                    <button type="button" onClick={() => setMode('login')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 mx-auto">
                      <ArrowLeft size={14} /> Back to Login
                    </button>
                  </div>
                </form>
              </>
            )}
            </div>
          </div>
        </div>

        {onShowPromo && (
          <div className="w-full max-w-4xl mt-12 flex flex-col items-center text-center">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Not a Member Yet?
            </h3>
            <button
              onClick={onShowPromo}
              className="group flex items-center justify-center gap-3 px-10 py-5 rounded-xl transition-all hover:scale-105 shadow-lg"
              style={{ 
                background: 'linear-gradient(135deg, #D4AF37 0%, #B8962E 50%, #D4AF37 100%)',
                boxShadow: '0 8px 30px rgba(212, 175, 55, 0.4)'
              }}
            >
              <span className="text-lg md:text-xl font-bold text-black">
                Discover Why Leaders Choose Marcus Hall!
              </span>
              <ArrowRight size={24} className="text-black group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}

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
              <button onClick={onSwitchToAdmin} className="text-gray-500 hover:text-gray-300 transition-colors">Admin</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
