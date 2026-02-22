import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, Send, ChevronRight, Command, AlertCircle, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

interface TerminalLine {
    type: 'input' | 'output' | 'error' | 'system';
    content: string;
    timestamp: Date;
}

const TerminalPage: React.FC = () => {
    const { t } = useTranslation();
    const [history, setHistory] = useState<TerminalLine[]>([
        {
            type: 'system',
            content: t('terminal.welcome'),
            timestamp: new Date()
        },
        {
            type: 'system',
            content: t('terminal.welcomeSub'),
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [history]);

    const executeCommand = async (cmd: string) => {
        const parts = cmd.trim().split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        try {
            switch (command) {
                case 'help':
                    return [
                        t('terminal.help.title'),
                        `  status       - ${t('terminal.help.status')}`,
                        `  restart      - ${t('terminal.help.restart')}`,
                        `  logs         - ${t('terminal.help.logs')}`,
                        `  version      - ${t('terminal.help.version')}`,
                        `  clear        - ${t('terminal.help.clear')}`
                    ];

                case 'clear':
                    setHistory([]);
                    return null;

                case 'status':
                    const health = await axios.get('/api/health');
                    return [
                        t('terminal.status.title'),
                        JSON.stringify(health.data, null, 2)
                    ];

                case 'restart':
                    if (!args[0]) {
                        return [t('terminal.restart.usage')];
                    }
                    await axios.post(`/api/system/restart/${args[0]}`);
                    return [t('terminal.restart.sent', { service: args[0] })];

                case 'logs':
                    if (!args[0]) {
                        return [t('terminal.help.logs')];
                    }
                    const logRes = await axios.get(`/api/system/logs/${args[0]}?lines=${args[1] || 50}`);
                    if (logRes.data && logRes.data.logs) {
                        return [
                            t('terminal.logs.header', { container: args[0], lines: args[1] || '50' }),
                            ...(Array.isArray(logRes.data.logs) ? logRes.data.logs : [logRes.data.logs])
                        ];
                    }
                    return [t('terminal.logs.notFound')];

                case 'version':
                    return [t('terminal.version.info')];

                default:
                    return [t('terminal.errors.notFound', { command })];
            }
        } catch (err: any) {
            return [t('terminal.errors.execution', { message: err.message || String(err) })];
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isProcessing) return;

        const cmd = input.trim();
        setInput('');
        setHistory(prev => [...prev, { type: 'input', content: cmd, timestamp: new Date() }]);

        setIsProcessing(true);
        const output = await executeCommand(cmd);
        setIsProcessing(false);

        if (output) {
            setHistory(prev => [
                ...prev,
                ...output.map(line => ({
                    type: (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) ? 'error' : 'output' as const,
                    content: line,
                    timestamp: new Date()
                }))
            ]);
        }
    };

    const clearTerminal = () => {
        setHistory([]);
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <TerminalIcon className="text-blue-500" />
                        {t('terminal.title')}
                    </h1>
                    <p className="text-muted-foreground">
                        {t('terminal.description')}
                    </p>
                </div>
                <button
                    onClick={clearTerminal}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-md hover:bg-slate-50 transition-colors"
                >
                    <Trash2 size={16} />
                    {t('terminal.help.clear')}
                </button>
            </div>

            <div className="bg-slate-900 rounded-lg shadow-xl overflow-hidden border border-slate-800 flex flex-col h-[600px]">
                {/* Terminal Header */}
                <div className="bg-slate-800/50 px-4 py-2 border-b border-slate-700 flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/50" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                        <div className="w-3 h-3 rounded-full bg-green-500/50" />
                    </div>
                    <span className="text-xs text-slate-400 font-mono ml-2">ai-agent-terminal -- bash</span>
                </div>

                {/* Console Area */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-1"
                >
                    {history.map((line, i) => (
                        <div key={i} className="flex gap-2">
                            <span className="text-slate-500 shrink-0">
                                [{line.timestamp.toLocaleTimeString([], { hour12: false })}]
                            </span>
                            {line.type === 'input' && (
                                <span className="text-blue-400 font-bold shrink-0">$</span>
                            )}
                            {line.type === 'error' && (
                                <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={14} />
                            )}
                            <span className={`
                ${line.type === 'input' ? 'text-white' : ''}
                ${line.type === 'output' ? 'text-slate-300' : ''}
                ${line.type === 'error' ? 'text-red-400' : ''}
                ${line.type === 'system' ? 'text-green-400/80 italic' : ''}
                break-all whitespace-pre-wrap
              `}>
                                {line.content}
                            </span>
                        </div>
                    ))}
                    {isProcessing && (
                        <div className="flex gap-2 animate-pulse text-slate-500 italic">
                            <span className="shrink-0">$</span>
                            <span>{t('terminal.processing')}</span>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <form
                    onSubmit={handleSubmit}
                    className="p-4 bg-slate-800/30 border-t border-slate-800 flex items-center gap-3"
                >
                    <ChevronRight className="text-blue-500 shrink-0" size={20} />
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={t('terminal.placeholder')}
                        className="flex-1 bg-transparent border-none outline-none text-slate-100 placeholder:text-slate-600 font-mono"
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isProcessing}
                        className="text-slate-400 hover:text-blue-400 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>

            <div className="mt-6 p-4 bg-blue-50/50 border border-blue-100 rounded-lg flex gap-3">
                <Command className="text-blue-500 shrink-0" size={20} />
                <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">Pro Tip:</p>
                    <p>
                        You can use the terminal to quickly check agent status or restart the AI engine without
                        navigating to the system configuration pages.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default TerminalPage;
