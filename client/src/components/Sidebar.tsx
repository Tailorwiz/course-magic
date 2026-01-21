import React from 'react';
import { LayoutDashboard, BookOpen, GraduationCap, Settings, LogOut, PlusCircle, FlaskConical, Users, User, Video, Briefcase, Award, ShieldCheck, LifeBuoy, MessageSquare, Bug, Inbox, X, FolderOpen, Wrench } from 'lucide-react';
import { UserRole } from '../types';

interface SidebarProps {
  currentView: string;
  setView: (view: string) => void;
  role: UserRole;
  switchRole: () => void;
  onLogout: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, role, switchRole, onLogout, isOpen, onClose }) => {
  const isCreator = role === UserRole.CREATOR;
  const sidebarWidth = isCreator ? 'w-72 lg:w-60 xl:w-64 2xl:w-72' : 'w-80 lg:w-64 xl:w-72 2xl:w-80';

  const handleNavigation = (view: string) => {
      setView(view);
      if (window.innerWidth < 1024 && onClose) {
          onClose();
      }
  };

  return (
    <>
        {/* Mobile Backdrop Overlay */}
        {isOpen && (
            <div 
                className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />
        )}

        <div className={`
            ${sidebarWidth} 
            bg-slate-900 text-slate-300 flex flex-col h-screen fixed left-0 top-0 border-r border-slate-800 z-50 
            transition-transform duration-300 ease-in-out
            ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
        `}>
          <div className={`border-b border-slate-800 flex flex-col justify-center relative ${isCreator ? 'p-6 h-24' : 'p-8 pb-10'}`}>
            {/* Mobile Close Button */}
            <div className="lg:hidden absolute top-4 right-4">
               <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors"><X size={24} /></button>
            </div>

            {isCreator ? (
                <div className="flex items-center gap-4 group cursor-default">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/30 group-hover:scale-105 transition-transform duration-300">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <span className="text-xl font-black text-white tracking-tight block">CourseMagic</span>
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Creator Studio</span>
                  </div>
                </div>
            ) : (
                <div className="flex items-center gap-4 group cursor-default animate-fade-in">
                  <div className="w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-600 shadow-2xl shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-300 border border-white/10">
                    <Briefcase className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex flex-col justify-center">
                      <span className="text-2xl font-black text-white leading-none tracking-tight uppercase drop-shadow-md text-left">Jobs On<br/>Demand</span>
                      <div className="flex items-center gap-2 mt-1.5">
                          <div className="h-0.5 w-6 bg-emerald-500 rounded-full"></div>
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em]">Academy</span>
                      </div>
                  </div>
                </div>
            )}
          </div>

          <nav className={`flex-1 p-5 space-y-6 ${isCreator ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}>
            {isCreator ? (
              <>
                {/* Overview Section */}
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500 mb-3 px-4 tracking-wider flex items-center gap-2">
                    <div className="h-px flex-1 bg-slate-800"></div>
                    <span>Overview</span>
                    <div className="h-px flex-1 bg-slate-800"></div>
                  </div>
                  <div className="space-y-1">
                    <NavItem 
                      icon={<LayoutDashboard />} 
                      label="Dashboard" 
                      active={currentView === 'dashboard'} 
                      onClick={() => handleNavigation('dashboard')} 
                    />
                    <NavItem 
                      icon={<FolderOpen />} 
                      label="All Courses & Videos" 
                      active={currentView === 'all_content'} 
                      onClick={() => handleNavigation('all_content')} 
                    />
                    <NavItem 
                      icon={<Inbox />} 
                      label="Support Inbox" 
                      active={currentView === 'inbox'} 
                      onClick={() => handleNavigation('inbox')} 
                    />
                  </div>
                </div>

                {/* Create Section */}
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500 mb-3 px-4 tracking-wider flex items-center gap-2">
                    <div className="h-px flex-1 bg-slate-800"></div>
                    <span>Create</span>
                    <div className="h-px flex-1 bg-slate-800"></div>
                  </div>
                  <div className="space-y-1">
                    <NavItem 
                      icon={<PlusCircle />} 
                      label="New Course" 
                      active={currentView === 'create_course'} 
                      onClick={() => handleNavigation('create_course')} 
                    />
                    <NavItem 
                      icon={<Video />} 
                      label="New Video" 
                      active={currentView === 'create_video' || currentView === 'select_video_type'} 
                      onClick={() => handleNavigation('select_video_type')} 
                    />
                  </div>
                </div>

                {/* Manage Section */}
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500 mb-3 px-4 tracking-wider flex items-center gap-2">
                    <div className="h-px flex-1 bg-slate-800"></div>
                    <span>Manage</span>
                    <div className="h-px flex-1 bg-slate-800"></div>
                  </div>
                  <div className="space-y-1">
                    <NavItem 
                      icon={<Users />} 
                      label="Students" 
                      active={currentView === 'students'} 
                      onClick={() => handleNavigation('students')} 
                    />
                    <NavItem 
                      icon={<FlaskConical />} 
                      label="Test Lab" 
                      active={currentView === 'test_lab'} 
                      onClick={() => handleNavigation('test_lab')} 
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-bold uppercase text-slate-500 mb-2 px-2 tracking-wider">
                  Student Portal
                </div>
                 <NavItem 
                  icon={<LayoutDashboard />} 
                  label="Dashboard" 
                  active={currentView === 'dashboard'} 
                  onClick={() => handleNavigation('dashboard')} 
                />
                 <NavItem 
                  icon={<BookOpen />} 
                  label="My Courses" 
                  active={currentView === 'learning'} 
                  onClick={() => handleNavigation('learning')} 
                />
                <NavItem 
                  icon={<GraduationCap />} 
                  label="My Certifications" 
                  active={currentView === 'certificates'} 
                  onClick={() => handleNavigation('certificates')} 
                />
                <NavItem 
                  icon={<User />} 
                  label="My Account" 
                  active={currentView === 'account'} 
                  onClick={() => handleNavigation('account')} 
                />
                <NavItem 
                  icon={<FolderOpen />} 
                  label="My Resources" 
                  active={currentView === 'resources'} 
                  onClick={() => handleNavigation('resources')} 
                />
                <NavItem 
                  icon={<Wrench />} 
                  label="My Tools" 
                  active={currentView === 'tools'} 
                  onClick={() => handleNavigation('tools')} 
                />
                
                <div className="pt-4 mt-4 border-t border-slate-800">
                    <div className="text-xs font-bold uppercase text-slate-500 mb-4 px-2 tracking-wider">
                      Support
                    </div>
                    <NavItem 
                      icon={<LifeBuoy />} 
                      label="Get Help" 
                      active={currentView === 'help'} 
                      onClick={() => handleNavigation('help')} 
                    />
                    <NavItem 
                      icon={<MessageSquare />} 
                      label="Ask Instructor" 
                      active={currentView === 'ask'} 
                      onClick={() => handleNavigation('ask')} 
                    />
                    <NavItem 
                      icon={<Bug />} 
                      label="Report Bug" 
                      active={currentView === 'bug'} 
                      onClick={() => handleNavigation('bug')} 
                    />
                </div>
              </>
            )}
          </nav>

          {/* Bottom Section - Account & Settings (Creator only) */}
          {isCreator && (
            <div className="border-t border-slate-800 p-5">
              <div className="text-xs font-bold uppercase text-slate-500 mb-3 px-4 tracking-wider flex items-center gap-2">
                <div className="h-px flex-1 bg-slate-800"></div>
                <span>Account</span>
                <div className="h-px flex-1 bg-slate-800"></div>
              </div>
              <div className="space-y-1">
                <NavItem 
                  icon={<User />} 
                  label="My Account" 
                  active={currentView === 'admin_account'} 
                  onClick={() => handleNavigation('admin_account')} 
                />
                <NavItem 
                  icon={<Settings />} 
                  label="Settings" 
                  active={currentView === 'settings'} 
                  onClick={() => handleNavigation('settings')} 
                />
              </div>
            </div>
          )}

          {/* Sign Out */}
          <div className="border-t border-slate-800 p-5 pt-4">
            <button 
                onClick={onLogout}
                className="flex items-center gap-4 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all w-full rounded-xl px-4 py-3 font-medium"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>
    </>
  );
};

const NavItem = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-4 rounded-xl transition-all group px-4 py-3 ${
      active 
        ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-900/30' 
        : 'hover:bg-slate-800/70 text-slate-400 hover:text-white'
    }`}
  >
    {React.cloneElement(icon as React.ReactElement<any>, { size: 22, className: active ? 'text-white' : 'text-slate-500 group-hover:text-white transition-colors' })}
    <span className="font-semibold text-[15px] tracking-tight">{label}</span>
  </button>
);
