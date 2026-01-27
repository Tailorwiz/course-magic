
import React, { useState, useEffect, useRef } from 'react';
import { SupportTicket } from '../types';
import { loadTicketsFromDB, updateTicketStatusInDB, importTicketsToDB } from '../utils';
import { MessageSquare, Bug, LifeBuoy, CheckCircle2, Circle, RefreshCcw, User, Download, UploadCloud } from 'lucide-react';
import { Button } from '../components/Button';

export const SupportInbox: React.FC = () => {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [loading, setLoading] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const refreshTickets = async () => {
        setLoading(true);
        const data = await loadTicketsFromDB();
        // Sort by timestamp desc
        data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTickets(data);
        setLoading(false);
    };

    useEffect(() => {
        refreshTickets();
    }, []);

    const handleResolve = async (id: string) => {
        await updateTicketStatusInDB(id, 'resolved');
        refreshTickets();
        if (selectedTicket?.id === id) {
            setSelectedTicket(prev => prev ? { ...prev, status: 'resolved' } : null);
        }
    };

    const handleReopen = async (id: string) => {
        await updateTicketStatusInDB(id, 'open');
        refreshTickets();
        if (selectedTicket?.id === id) {
            setSelectedTicket(prev => prev ? { ...prev, status: 'open' } : null);
        }
    };
    
    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tickets, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `support_tickets_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                const ticketArray = Array.isArray(json) ? json : [json];
                
                // Basic validation
                const validTickets = ticketArray.filter((t: any) => t.id && t.studentEmail && t.message);
                
                if (validTickets.length > 0) {
                    setLoading(true);
                    await importTicketsToDB(validTickets);
                    await refreshTickets();
                    alert(`Successfully imported ${validTickets.length} tickets.`);
                } else {
                    alert("No valid tickets found in file.");
                }
            } catch (err) {
                console.error(err);
                alert("Failed to parse ticket file.");
            } finally {
                setLoading(false);
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const filteredTickets = tickets.filter(t => {
        if (filter === 'all') return true;
        return t.status === filter;
    });

    const getIcon = (type: string) => {
        switch(type) {
            case 'bug': return <Bug size={16} className="text-red-500"/>;
            case 'help_chat': return <LifeBuoy size={16} className="text-indigo-500"/>;
            default: return <MessageSquare size={16} className="text-emerald-500"/>;
        }
    };

    const getBadgeColor = (type: string) => {
        switch(type) {
            case 'bug': return "bg-red-50 text-red-700 border-red-200";
            case 'help_chat': return "bg-indigo-50 text-indigo-700 border-indigo-200";
            default: return "bg-emerald-50 text-emerald-700 border-emerald-200";
        }
    };

    return (
        <div className="p-8 h-screen flex flex-col max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Support Inbox</h1>
                    <p className="text-slate-500">Manage student questions and issues.</p>
                </div>
                <div className="flex gap-2">
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} icon={<UploadCloud size={14}/>}>Import</Button>
                    <Button variant="outline" onClick={handleExport} icon={<Download size={14}/>}>Export</Button>
                    <Button onClick={refreshTickets} variant="outline" icon={<RefreshCcw size={14}/>} isLoading={loading}>Refresh</Button>
                </div>
            </div>

            <div className="flex gap-6 flex-1 overflow-hidden">
                {/* List Column */}
                <div className="w-1/3 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-100 flex gap-2 bg-slate-50">
                        <button onClick={() => setFilter('all')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${filter === 'all' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>All</button>
                        <button onClick={() => setFilter('open')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${filter === 'open' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Open</button>
                        <button onClick={() => setFilter('resolved')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${filter === 'resolved' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>Resolved</button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {filteredTickets.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-sm">No tickets found.</div>
                        ) : (
                            filteredTickets.map(ticket => (
                                <button 
                                    key={ticket.id}
                                    onClick={() => setSelectedTicket(ticket)}
                                    className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${selectedTicket?.id === ticket.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getBadgeColor(ticket.type)} flex items-center gap-1`}>
                                            {getIcon(ticket.type)} {ticket.type.replace('_', ' ')}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{new Date(ticket.timestamp).toLocaleDateString()}</span>
                                    </div>
                                    <h4 className="font-bold text-slate-800 text-sm truncate mb-1">{ticket.subject || "No Subject"}</h4>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500 truncate flex items-center gap-1"><User size={10}/> {ticket.studentName}</span>
                                        {ticket.status === 'resolved' && <CheckCircle2 size={14} className="text-emerald-500"/>}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Detail Column */}
                <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                    {selectedTicket ? (
                        <>
                            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <h2 className="text-xl font-bold text-slate-900">{selectedTicket.subject || "No Subject"}</h2>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${selectedTicket.status === 'open' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                                            {selectedTicket.status}
                                        </span>
                                    </div>
                                    <div className="text-sm text-slate-500 flex items-center gap-4">
                                        <span className="flex items-center gap-1"><User size={14}/> {selectedTicket.studentName} ({selectedTicket.studentEmail})</span>
                                        <span>•</span>
                                        <span>{new Date(selectedTicket.timestamp).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div>
                                    {selectedTicket.status === 'open' ? (
                                        <Button size="sm" onClick={() => handleResolve(selectedTicket.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white" icon={<CheckCircle2 size={16}/>}>Mark Resolved</Button>
                                    ) : (
                                        <Button size="sm" variant="outline" onClick={() => handleReopen(selectedTicket.id)}>Reopen Ticket</Button>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex-1 p-8 overflow-y-auto bg-white">
                                {selectedTicket.type === 'help_chat' ? (
                                    <div className="space-y-4">
                                        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg text-sm text-indigo-800 mb-6">
                                            This is a transcript of an AI Help Chat session escalated by the student.
                                        </div>
                                        <div className="space-y-4">
                                            {(() => {
                                                try {
                                                    const msgs = JSON.parse(selectedTicket.message);
                                                    if (Array.isArray(msgs)) {
                                                        return msgs.map((m: any, i: number) => (
                                                            <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                                <div className={`max-w-[80%] p-3 rounded-lg text-sm ${m.sender === 'user' ? 'bg-slate-100 text-slate-800' : 'bg-indigo-50 text-indigo-900 border border-indigo-100'}`}>
                                                                    <div className="text-[10px] font-bold uppercase mb-1 opacity-50">{m.sender === 'user' ? 'Student' : 'AI Bot'}</div>
                                                                    {m.text}
                                                                </div>
                                                            </div>
                                                        ));
                                                    }
                                                    return <p>{selectedTicket.message}</p>;
                                                } catch {
                                                    return <p className="whitespace-pre-wrap">{selectedTicket.message}</p>;
                                                }
                                            })()}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="prose prose-slate max-w-none">
                                        <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">{selectedTicket.message}</p>
                                    </div>
                                )}
                            </div>
                            
                            <div className="p-6 border-t border-slate-100 bg-slate-50">
                                <p className="text-xs text-slate-400 italic text-center">Reply functionality coming soon. For now, please email the student directly at {selectedTicket.studentEmail}.</p>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                <MessageSquare size={32} className="opacity-50"/>
                            </div>
                            <p>Select a ticket to view details.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
