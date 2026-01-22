import React, { useState, useRef } from 'react';
import { User } from '../types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { User as UserIcon, Mail, Phone, MapPin, UploadCloud, Save, X, Edit3, Camera } from 'lucide-react';

interface StudentAccountProps {
    user: User;
    onUpdate: (user: User) => void;
    onBack?: () => void;
}

export const StudentAccount: React.FC<StudentAccountProps> = ({ user, onUpdate, onBack }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({ ...user });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, avatarUrl: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        onUpdate(formData);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setFormData({ ...user });
        setIsEditing(false);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto animate-fade-in">
             <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-slate-900">Account Information</h1>
                {!isEditing && (
                    <Button onClick={() => setIsEditing(true)} icon={<Edit3 size={16}/>} variant="outline">
                        Edit Profile
                    </Button>
                )}
             </div>

             <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                 <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row items-center gap-8">
                     <div className="relative group">
                         <div className="w-32 h-32 rounded-full border-4 border-slate-50 bg-slate-200 overflow-hidden shadow-sm flex-shrink-0">
                             <img src={formData.avatarUrl} className="w-full h-full object-cover" alt="Profile" />
                         </div>
                         {isEditing && (
                             <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm"
                             >
                                 <Camera size={24} className="mb-1" />
                                 <span className="text-[10px] font-bold uppercase tracking-wider">Change</span>
                             </button>
                         )}
                         <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
                     </div>
                     
                     <div className="text-center md:text-left flex-1 w-full">
                         {isEditing ? (
                             <div className="max-w-md space-y-4">
                                 <Input 
                                    label="Full Name" 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    icon={<UserIcon size={16}/>}
                                 />
                                 <p className="text-xs text-slate-400">Your public display name on certificates.</p>
                             </div>
                         ) : (
                             <>
                                <h2 className="text-2xl font-bold text-slate-900">{user.name}</h2>
                                <p className="text-slate-500 uppercase text-xs font-bold tracking-wider mt-1">{user.role}</p>
                             </>
                         )}
                     </div>
                 </div>

                 <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div>
                         <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Email Address</label>
                         <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200 text-slate-600">
                             <Mail size={16} />
                             <span className="text-sm">{user.email}</span>
                         </div>
                         <p className="text-[10px] text-slate-400 mt-1">Email cannot be changed.</p>
                     </div>
                     <div>
                         <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Phone</label>
                         {isEditing ? (
                             <Input 
                                value={formData.phone || ''} 
                                onChange={e => setFormData({...formData, phone: e.target.value})} 
                                placeholder="(555) 000-0000"
                                icon={<Phone size={16}/>}
                             />
                         ) : (
                             <p className="text-slate-900 font-medium py-2">{user.phone || 'Not provided'}</p>
                         )}
                     </div>
                     <div>
                         <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Location</label>
                         {isEditing ? (
                             <div className="flex gap-2">
                                 <div className="flex-1">
                                     <Input 
                                        placeholder="City" 
                                        value={formData.city || ''} 
                                        onChange={e => setFormData({...formData, city: e.target.value})}
                                        icon={<MapPin size={16}/>}
                                     />
                                 </div>
                                 <div className="w-24">
                                     <Input 
                                        placeholder="State" 
                                        value={formData.state || ''} 
                                        onChange={e => setFormData({...formData, state: e.target.value})}
                                        maxLength={2}
                                     />
                                 </div>
                             </div>
                         ) : (
                             <p className="text-slate-900 font-medium py-2">{user.city && user.state ? `${user.city}, ${user.state}` : 'Not provided'}</p>
                         )}
                     </div>
                     <div>
                         <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Member ID</label>
                         <p className="text-slate-900 font-medium font-mono text-xs py-2">{user.id}</p>
                     </div>
                 </div>

                 {isEditing && (
                     <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                         <Button variant="outline" onClick={handleCancel}>Cancel</Button>
                         <Button onClick={handleSave} icon={<Save size={16}/>}>Save Profile</Button>
                     </div>
                 )}
             </div>
             
             <div className="md:hidden mt-8 pb-8 text-center">
                   <button onClick={onBack} className="text-indigo-600 font-bold text-sm">
                       ← Back to Dashboard
                   </button>
               </div>
         </div>
    );
};
