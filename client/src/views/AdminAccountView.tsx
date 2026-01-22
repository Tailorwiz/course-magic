import React, { useState, useRef } from 'react';
import { User, Mail, Phone, MapPin, Camera, Shield, Key, Save, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/Button';
import { User as UserType } from '../types';

interface AdminAccountViewProps {
    user: UserType;
    onUpdateUser: (user: UserType) => void;
}

export const AdminAccountView: React.FC<AdminAccountViewProps> = ({ user, onUpdateUser }) => {
    const [name, setName] = useState(user.name);
    const [email, setEmail] = useState(user.email);
    const [phone, setPhone] = useState(user.phone || '');
    const [city, setCity] = useState(user.city || '');
    const [state, setState] = useState(user.state || '');
    const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatarUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => {
            const updatedUser: UserType = {
                ...user,
                name,
                email,
                phone,
                city,
                state,
                avatarUrl
            };
            onUpdateUser(updatedUser);
            setIsSaving(false);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        }, 500);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Shield className="text-indigo-600" size={28} />
                    Admin Account
                </h1>
                <p className="text-slate-500">Manage your administrator profile and settings.</p>
            </div>

            <div className="space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 h-32 relative">
                        <div className="absolute -bottom-12 left-8">
                            <div 
                                className="w-24 h-24 rounded-2xl bg-white border-4 border-white shadow-xl overflow-hidden cursor-pointer group relative"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Camera className="text-white" size={24} />
                                </div>
                            </div>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                accept="image/*" 
                                className="hidden" 
                                onChange={handleAvatarChange} 
                            />
                        </div>
                    </div>
                    
                    <div className="pt-16 pb-6 px-8">
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-xl font-bold text-slate-900">{user.name}</h2>
                            <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded-full uppercase">Admin</span>
                        </div>
                        <p className="text-slate-500 text-sm">{user.email}</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <User className="text-slate-400" size={20} />
                        Profile Information
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input 
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800"
                                />
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input 
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800"
                                />
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Phone Number</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input 
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="(555) 000-0000"
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder-slate-400"
                                />
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Location</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input 
                                        type="text"
                                        value={city}
                                        onChange={(e) => setCity(e.target.value)}
                                        placeholder="City"
                                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder-slate-400"
                                    />
                                </div>
                                <input 
                                    type="text"
                                    value={state}
                                    onChange={(e) => setState(e.target.value)}
                                    placeholder="State"
                                    maxLength={2}
                                    className="w-20 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder-slate-400 text-center uppercase"
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-8 flex items-center gap-4">
                        <Button 
                            onClick={handleSave}
                            isLoading={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                        >
                            <Save size={18} /> Save Changes
                        </Button>
                        {saveSuccess && (
                            <span className="text-emerald-600 text-sm flex items-center gap-1 animate-fade-in">
                                <CheckCircle2 size={16} /> Profile updated successfully
                            </span>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <Key className="text-slate-400" size={20} />
                        Account Security
                    </h3>
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-slate-900">Password</p>
                                <p className="text-sm text-slate-500">Last changed: Never</p>
                            </div>
                            <Button variant="outline" className="text-sm">
                                Change Password
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
