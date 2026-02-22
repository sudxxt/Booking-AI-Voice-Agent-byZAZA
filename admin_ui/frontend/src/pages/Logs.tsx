import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { RefreshCw, Pause, Play, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Logs = () => {
    const { t } = useTranslation();
    const [logs, setLogs] = useState('');
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [container, setContainer] = useState('ai_engine');
    const [filter, setFilter] = useState('');
    const logsEndRef = useRef<HTMLDivElement>(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/logs/${container}?tail=500`);
            setLogs(res.data.logs);
        } catch (err) {
            console.error("Failed to fetch logs", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(() => {
            if (autoRefresh) {
                fetchLogs();
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [autoRefresh, container]);

    useEffect(() => {
        if (autoRefresh) {
            logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, autoRefresh]);

    const getColoredLogs = () => {
        if (!logs) return <div className="text-muted-foreground italic">{t('logs.noLogs')}</div>;

        return logs.split('\n').map((line, i) => {
            if (filter && !line.toLowerCase().includes(filter.toLowerCase())) return null;

            let className = 'text-green-400'; // Default
            if (line.includes('ERROR') || line.includes('Exception') || line.includes('CRITICAL')) {
                className = 'text-red-500 font-bold';
            } else if (line.includes('WARN') || line.includes('WARNING')) {
                className = 'text-yellow-500';
            } else if (line.includes('INFO')) {
                className = 'text-blue-400';
            } else if (line.includes('DEBUG')) {
                className = 'text-gray-500';
            }

            return <div key={i} className={`${className} hover:bg-white/5 px-1 rounded`}>{line}</div>;
        });
    };

    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="flex justify-between items-center">
                <div className="flex items-center space-x-4">
                    <h1 className="text-2xl font-bold">{t('logs.title')}</h1>
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder={t('logs.filterPlaceholder')}
                            className="pl-8 pr-4 py-1 text-sm rounded-md border border-input bg-background w-64"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex space-x-2 items-center">
                    <select
                        className="p-2 rounded border border-input bg-background text-sm"
                        value={container}
                        onChange={e => setContainer(e.target.value)}
                    >
                        <option value="ai_engine">{t('logs.containers.ai_engine')}</option>
                        <option value="local_ai_server">{t('logs.containers.local_ai_server')}</option>
                        <option value="admin_ui">{t('logs.containers.admin_ui')}</option>
                    </select>

                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`p-2 rounded border ${autoRefresh ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-accent'}`}
                        title={autoRefresh ? t('logs.pauseAutoRefresh') : t('logs.resumeAutoRefresh')}
                    >
                        {autoRefresh ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>

                    <button
                        onClick={fetchLogs}
                        className="p-2 rounded border border-input hover:bg-accent"
                        title={t('logs.refreshNow')}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-black font-mono text-sm p-4 rounded-lg overflow-auto border border-border shadow-inner">
                {getColoredLogs()}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
};

export default Logs;
