import React, { useState } from 'react';
import { ArrowRight, Lock, Mail, ShieldCheck, AlertCircle, Briefcase, Shield } from 'lucide-react';
import { Button } from '../components/Button';

interface AdminLoginPageProps {
  onLogin: (email: string, pass: string) => boolean;
  onSwitchToStudent: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onLogin, onSwitchToStudent }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    setTimeout(() => {
        const success = onLogin(email, password);
        if (!success) {
            setError('Invalid admin credentials. Please try again.');
            setIsLoading(false);
        }
    }, 800);
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-50 font-sans">
      <div className="hidden lg:flex w-5/12 bg-indigo-900 relative overflow-hidden flex-col justify-between p-12 text-white">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1551434678-e076c223a692?q=80&w=2340&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/50 via-indigo-900/80 to-indigo-900"></div>
        
        <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30">
                    <Briefcase className="text-white" size={20} />
                </div>
                <h1 className="text-2xl font-bold tracking-wide text-white uppercase">
                    Jobs on Demand
                </h1>
            </div>
            <p className="text-indigo-300 text-xs font-bold tracking-[0.3em] uppercase ml-14">Instructor Portal</p>
        </div>

        <div className="relative z-10 space-y-8">
            <blockquote className="space-y-4">
                <p className="text-3xl font-serif leading-tight text-slate-100">
                    "Manage your courses, students, and content all in one place."
                </p>
                <footer className="flex items-center gap-4">
                    <div className="h-px w-12 bg-indigo-400"></div>
                    <span className="text-slate-300 text-sm uppercase tracking-widest">Admin Dashboard</span>
                </footer>
            </blockquote>

            <div className="space-y-4 pt-8">
                <div className="flex items-center gap-3 text-slate-300">
                    <Shield size={20} className="text-indigo-400" />
                    <span className="text-sm font-medium">Course Management</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                    <Shield size={20} className="text-indigo-400" />
                    <span className="text-sm font-medium">Student Analytics</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                    <Shield size={20} className="text-indigo-400" />
                    <span className="text-sm font-medium">Content Creation Tools</span>
                </div>
            </div>
        </div>

        <div className="relative z-10 text-xs text-indigo-300 flex justify-between">
            <span>© 2024 Jobs on Demand Academy</span>
            <span className="flex items-center gap-2"><ShieldCheck size={12}/> Secure Admin Access</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-12 relative overflow-y-auto">
         <div className="w-full max-w-md space-y-6">
            <div className="text-center lg:text-left">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <Shield className="text-indigo-600" size={24} />
                    </div>
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Instructor Access</span>
                </div>
                <h2 className="text-3xl font-serif font-bold text-slate-900 mb-2">
                    Admin Login
                </h2>
                <p className="text-slate-500">
                    Sign in to manage your courses and students.
                </p>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 animate-fade-in">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6 mt-8 animate-fade-in">
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Admin Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder-slate-400"
                                placeholder="admin@company.com"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder-slate-400"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-sm text-slate-600">Remember me</span>
                    </label>
                </div>

                <Button 
                    type="submit"
                    isLoading={isLoading}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all transform hover:translate-y-[-1px]"
                >
                    Sign In as Admin <ArrowRight size={18} />
                </Button>

                <div className="pt-6 text-center border-t border-slate-100">
                    <p className="text-slate-500 text-sm">
                        Are you a student? <button type="button" onClick={onSwitchToStudent} className="font-bold text-indigo-600 hover:underline">Go to Student Login</button>
                    </p>
                </div>
            </form>
         </div>
      </div>
    </div>
  );
};
