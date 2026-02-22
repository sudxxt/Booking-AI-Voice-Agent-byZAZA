import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { RefreshCw, Pause, Play, Terminal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { parseAnsi } from '../../utils/ansi';
import { describeApiError } from '../../utils/apiErrors';

type LogLevel = 'error' | 'warning' | 'info' | 'debug';
type LogCategory = 'call' | 'provider' | 'audio' | 'transport' | 'vad' | 'tools' | 'config';
type LogsMode = 'troubleshoot' | 'raw';
type TroubleshootView = 'overview' | 'issues' | 'provider' | 'media' | 'vad' | 'tools' | 'all';

type LogEvent = {
    ts: string | null;
    level: LogLevel;
    msg: string;
    component: string | null;
    call_id: string | null;
    provider: string | null;
    context: string | null;
    pipeline: string | null;
    category: LogCategory;
    milestone: boolean;
    meta?: Record<string, string>;
    raw: string;
};

type CallMeta = {
    call_id: string;
    caller_number: string | null;
    caller_name: string | null;
    start_time: string | null;
    end_time: string | null;
    duration_seconds: number;
    provider_name: string;
    pipeline_name: string | null;
    context_name: string | null;
    outcome: string;
    error_message: string | null;
    barge_in_count: number;
    avg_turn_latency_ms: number;
    total_turns: number;
};

type EventsResponse = {
    events: LogEvent[];
    call?: CallMeta | null;
    window?: { source: string; since: string | null; until: string | null } | null;
    related_ids?: string[];
    related_bridge_ids?: string[];
};

type CallRecordSummary = {
    id: string;
    call_id: string;
    caller_number: string | null;
    caller_name: string | null;
    start_time: string | null;
    end_time: string | null;
    duration_seconds: number;
    provider_name: string;
    pipeline_name: string | null;
    context_name: string | null;
    outcome: string;
    error_message: string | null;
    avg_turn_latency_ms: number;
    total_turns: number;
    barge_in_count: number;
};

type CallListResponse = {
    calls: CallRecordSummary[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
};

type FilterOptions = {
    providers: string[];
    pipelines: string[];
    contexts: string[];
    outcomes: string[];
};

// Back-compat: old URLs used `preset=important|audio|provider|transport|vad|tools|config`
const mapLegacyPresetToView = (preset: string | null): TroubleshootView => {
    switch ((preset || '').toLowerCase()) {
        case 'important':
            return 'overview';
        case 'audio':
            return 'media';
        case 'provider':
            return 'provider';
        case 'transport':
            return 'media';
        case 'vad':
            return 'vad';
        case 'tools':
            return 'tools';
        case 'config':
            return 'issues';
        default:
            return 'overview';
    }
};

const LogsPage = () => {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [logs, setLogs] = useState('');
    const [events, setEvents] = useState<LogEvent[]>([]);
    const [eventsMeta, setEventsMeta] = useState<EventsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [container, setContainer] = useState(searchParams.get('container') || 'ai_engine');
    const [mode, setMode] = useState<LogsMode>(() => {
        const rawMode = (searchParams.get('mode') || '').toLowerCase();
        // Back-compat: old URLs used mode=events
        if (rawMode === 'events') return 'troubleshoot';
        if (rawMode === 'troubleshoot') return 'troubleshoot';
        // Default is Raw for fast scanning; Troubleshoot is the call-centric flow.
        return 'raw';
    });
    const [view, setView] = useState<TroubleshootView>(() => {
        const v = (searchParams.get('view') || '').trim();
        if (v) return v as any;
        return mapLegacyPresetToView(searchParams.get('preset'));
    });
    const [callId, setCallId] = useState(searchParams.get('call_id') || '');
    const [q, setQ] = useState(searchParams.get('q') || '');
    const [rawLevels, setRawLevels] = useState<LogLevel[]>(() => {
        const v = (searchParams.get('raw_levels') || '').trim();
        if (!v) return ['error', 'warning'];
        return v.split(',').map(s => s.trim().toLowerCase() as LogLevel).filter(Boolean);
    });
    const [hidePayloads, setHidePayloads] = useState(searchParams.get('hide_payloads') !== 'false');
    const [since, setSince] = useState(searchParams.get('since') || '');
    const [until, setUntil] = useState(searchParams.get('until') || '');
    const [includeDebug, setIncludeDebug] = useState(() => {
        const v = searchParams.get('include_debug');
        if (v === null) return true;
        return v === 'true';
    });
    const [hideRepeats, setHideRepeats] = useState(searchParams.get('hide_repeats') !== 'false');
    const [showCallFinder, setShowCallFinder] = useState(!callId);
    const [callFilters, setCallFilters] = useState({
        caller_number: '',
        caller_name: '',
        provider_name: '',
        pipeline_name: '',
        context_name: '',
        outcome: '',
        start_date: '',
        end_date: '',
    });
    const [callFilterOptions, setCallFilterOptions] = useState<FilterOptions | null>(null);
    const [callResults, setCallResults] = useState<CallRecordSummary[]>([]);
    const [callPage, setCallPage] = useState(1);
    const [callTotalPages, setCallTotalPages] = useState(1);
    const [callLoading, setCallLoading] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);

    const recomputePinned = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
        setIsPinnedToBottom(remaining < 80);
    }, []);

    const updateUrlParams = (next: Record<string, string>) => {
        const merged: Record<string, string> = {};
        searchParams.forEach((v, k) => (merged[k] = v));
        Object.entries(next).forEach(([k, v]) => {
            if (!v) delete merged[k];
            else merged[k] = v;
        });
        setSearchParams(merged);
    };

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params: Record<string, any> = { tail: 500 };
            // Send as CSV for FastAPI list parsing (avoid axios `levels[]=...` serialization).
            if (rawLevels.length) params.levels = rawLevels.join(',');
            if (q.trim()) params.q = q.trim();
            const res = await axios.get(`/api/logs/${container}`, { params });
            setLogs(res.data.logs);
        } catch (err: any) {
            const info = describeApiError(err, `/api/logs/${container}`);
            console.error("Failed to fetch logs", info);
            setLogs(
                t('system.env.sections.aiEngine.logs.raw.fetchFailed', {
                    container,
                    status: info.status ? `HTTP ${info.status}` : info.kind,
                    kind: '',
                    detail: info.detail ? ` - ${info.detail}` : ''
                })
            );
        } finally {
            setLoading(false);
        }
    };

    const fetchEvents = async () => {
        setLoading(true);
        try {
            const viewCategories = (() => {
                switch (view) {
                    case 'provider':
                        return ['provider'];
                    case 'media':
                        return ['audio', 'transport'];
                    case 'vad':
                        return ['vad'];
                    case 'tools':
                        return ['tools'];
                    default:
                        return [];
                }
            })();
            const params: Record<string, any> = {
                limit: includeDebug ? 2000 : 500,
                hide_payloads: hidePayloads,
            };
            if (callId.trim()) params.call_id = callId.trim();
            // Focused views should fetch focused categories server-side so mid-call events
            // aren't dropped by window/limit slicing.
            if (viewCategories.length) params.categories = viewCategories.join(',');
            // Reduce payload size unless user explicitly opts into debug.
            if (!includeDebug) params.levels = 'error,warning,info';
            if (since.trim()) params.since = since.trim();
            if (until.trim()) params.until = until.trim();

            const res = await axios.get<EventsResponse>(`/api/logs/${container}/events`, { params });
            setEvents(res.data.events || []);
            setEventsMeta(res.data || null);
        } catch (err: any) {
            const info = describeApiError(err, `/api/logs/${container}/events`);
            console.error("Failed to fetch events", info);
            setEvents([]);
            setEventsMeta(null);
            setLogs(
                t('system.env.sections.aiEngine.logs.troubleshoot.fetchFailed', {
                    container,
                    status: info.status ? `HTTP ${info.status}` : info.kind,
                    kind: '',
                    detail: info.detail ? ` - ${info.detail}` : ''
                })
            );
        } finally {
            setLoading(false);
        }
    };

    const fetchCallFilterOptions = useCallback(async () => {
        try {
            const res = await axios.get<FilterOptions>('/api/calls/filters');
            setCallFilterOptions(res.data);
        } catch (err) {
            console.error('Failed to fetch call filter options', err);
        }
    }, []);

    const fetchCalls = useCallback(async () => {
        try {
            setCallLoading(true);
            const params: Record<string, any> = { page: callPage, page_size: 20 };
            Object.entries(callFilters).forEach(([k, v]) => {
                if (v) params[k] = v;
            });
            const res = await axios.get<CallListResponse>('/api/calls', { params });
            setCallResults(res.data.calls || []);
            setCallTotalPages(res.data.total_pages || 1);
        } catch (err) {
            console.error('Failed to fetch calls', err);
            setCallResults([]);
        } finally {
            setCallLoading(false);
        }
    }, [callFilters, callPage]);

    useEffect(() => {
        if (mode === 'troubleshoot') {
            fetchCallFilterOptions();
            if (showCallFinder) fetchCalls();
        }
    }, [mode, fetchCallFilterOptions, fetchCalls, showCallFinder]);

    useEffect(() => {
        // Keep call finder in sync with URL-provided call_id
        setShowCallFinder(!callId);
    }, [callId]);

    useEffect(() => {
        if (mode !== 'raw') return;
        fetchLogs();
        const interval = setInterval(() => {
            if (autoRefresh) fetchLogs();
        }, 3000);
        return () => clearInterval(interval);
    }, [autoRefresh, container, mode, q, rawLevels.join(',')]);

    useEffect(() => {
        if (mode !== 'troubleshoot') return;
        if (!callId) return;
        fetchEvents();
        const interval = setInterval(() => {
            if (!autoRefresh) return;
            if (!callId) return;
            fetchEvents();
        }, 3000);
        return () => clearInterval(interval);
    }, [autoRefresh, container, mode, callId, hidePayloads, since, until, includeDebug, view]);

    useEffect(() => {
        if (autoRefresh && isPinnedToBottom) {
            logsEndRef.current?.scrollIntoView({ behavior: "instant" as any });
        }
    }, [logs, events, autoRefresh, isPinnedToBottom]);

    useEffect(() => {
        // Keep legacy `preset` in sync for old links, but prefer `view`
        updateUrlParams({ view });
    }, [view]);

    const isIssueSignal = (e: LogEvent) => {
        if (e.level !== 'info') return false;
        const t = (e.msg || '').toLowerCase();
        // Exclude per-frame noise that fires every ~20ms.
        if (t.includes('encode resample')) return false;
        if (t.includes('encode config - reading provider config')) return false;
        if (t.includes('encoded for provider')) return false;
        if (t.includes('continuous input') && (t.includes('forwarding frame') || t.includes('frame sent'))) return false;
        if (t.includes('audiosocket rx') && t.includes('frame received')) return false;
        // Useful signals for narrowing issues
        const keywords = [
            'mismatch',
            'drift',
            'buffer',
            'underflow',
            'overflow',
            'dropped',
            'gap',
            'jitter',
            'loss',
            'rtt',
            'timeout',
            'retry',
            'reconnect',
            'fallback',
            'no active streaming',
            'grace_ms capped',
            'dc offset',
            'low audio energy',
        ];
        return keywords.some(k => t.includes(k));
    };

    const filteredEvents = useMemo(() => {
        if (mode !== 'troubleshoot') return [];
        const base = includeDebug ? events : events.filter(e => e.level !== 'debug');
        const viewFiltered = (() => {
            switch (view) {
                case 'overview':
                    return base.filter(e => e.level === 'error' || e.level === 'warning' || (e.level === 'info' && e.milestone));
                case 'issues':
                    return base.filter(e => e.level === 'error' || e.level === 'warning' || isIssueSignal(e));
                case 'provider':
                    return base.filter(e => e.category === 'provider' || e.level === 'error' || e.level === 'warning');
                case 'media':
                    return base.filter(e => e.category === 'audio' || e.category === 'transport' || e.level === 'error' || e.level === 'warning');
                case 'vad':
                    return base.filter(e => e.category === 'vad' || e.level === 'error' || e.level === 'warning');
                case 'tools':
                    return base.filter(e => e.category === 'tools' || e.level === 'error' || e.level === 'warning');
                case 'all':
                default:
                    return base;
            }
        })();

        if (!q.trim()) return viewFiltered;
        const qn = q.trim().toLowerCase();
        return viewFiltered.filter(e => (e.raw || '').toLowerCase().includes(qn) || (e.msg || '').toLowerCase().includes(qn));
    }, [events, mode, view, includeDebug, q]);

    const displayEvents = useMemo(() => {
        if (!hideRepeats) return (filteredEvents as any);
        const out: Array<LogEvent & { repeat?: number }> = [];
        for (const e of filteredEvents) {
            const prev = out[out.length - 1];
            const same =
                prev &&
                prev.level === e.level &&
                prev.category === e.category &&
                prev.msg === e.msg &&
                prev.call_id === e.call_id &&
                prev.provider === e.provider &&
                prev.milestone === e.milestone;
            if (same) {
                prev.repeat = (prev.repeat || 1) + 1;
            } else {
                out.push({ ...e, repeat: 1 });
            }
        }
        return out;
    }, [filteredEvents, hideRepeats]);

    const formatMeta = (meta?: Record<string, string>) => {
        if (!meta) return '';
        const entries = Object.entries(meta).filter(([_, v]) => v !== undefined && v !== null && String(v).trim() !== '');
        if (!entries.length) return '';
        // Keep compact: show up to 6 fields in the row.
        return entries
            .slice(0, 6)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ');
    };

    const levelBadge = (lvl: LogLevel) => {
        const cls =
            lvl === 'error' ? 'bg-red-600/20 text-red-300 border-red-800' :
                lvl === 'warning' ? 'bg-yellow-600/20 text-yellow-200 border-yellow-800' :
                    lvl === 'info' ? 'bg-blue-600/20 text-blue-200 border-blue-800' :
                        'bg-gray-600/20 text-gray-200 border-gray-700';
        return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] ${cls}`}>{lvl.toUpperCase()}</span>;
    };

    return (
        <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
            <div className="flex justify-between items-center flex-shrink-0">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('system.env.sections.aiEngine.logs.title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {t('system.env.sections.aiEngine.logs.desc')}
                    </p>
                </div>
                <div className="flex space-x-2 items-center">
                    <button
                        onClick={async () => {
                            try {
                                const response = await axios.get('/api/config/export-logs', { responseType: 'blob' });
                                const url = window.URL.createObjectURL(new Blob([response.data]));
                                const link = document.createElement('a');
                                link.href = url;
                                link.setAttribute('download', `debug-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`);
                                document.body.appendChild(link);
                                link.click();
                                link.remove();
                            } catch (err) {
                                console.error('Failed to export logs', err);
                                toast.error('Failed to export logs');
                            }
                        }}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3"
                        title={t('system.env.sections.aiEngine.logs.exportTooltip')}
                    >
                        <span className="mr-2">{t('system.env.sections.aiEngine.logs.export')}</span>
                        <Terminal className="w-4 h-4" />
                    </button>

                    <select
                        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={container}
                        onChange={e => {
                            setContainer(e.target.value);
                            updateUrlParams({ container: e.target.value });
                        }}
                    >
                        <option value="ai_engine">{t('system.env.sections.aiEngine.logs.container.ai_engine')}</option>
                        <option value="local_ai_server">{t('system.env.sections.aiEngine.logs.container.local_ai_server')}</option>
                        <option value="admin_ui">{t('system.env.sections.aiEngine.logs.container.admin_ui')}</option>
                    </select>

                    <select
                        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={mode}
                        onChange={e => {
                            const nextMode = e.target.value as LogsMode;
                            setMode(nextMode);
                            updateUrlParams({ mode: nextMode });
                        }}
                        title={t('system.env.sections.aiEngine.logs.mode.raw')} // Using raw as a generic label for mode title
                    >
                        <option value="troubleshoot">{t('system.env.sections.aiEngine.logs.mode.troubleshoot')}</option>
                        <option value="raw">{t('system.env.sections.aiEngine.logs.mode.raw')}</option>
                    </select>

                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-3 shadow-sm ${autoRefresh
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
                            }`}
                        title={autoRefresh ? t('system.env.sections.aiEngine.logs.pauseTooltip') : t('system.env.sections.aiEngine.logs.resumeTooltip')}
                    >
                        {autoRefresh ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                        {autoRefresh ? t('system.env.sections.aiEngine.logs.live') : t('system.env.sections.aiEngine.logs.paused')}
                    </button>

                    <button
                        onClick={() => {
                            if (mode === 'troubleshoot') {
                                if (showCallFinder) fetchCalls();
                                else fetchEvents();
                            } else {
                                fetchLogs();
                            }
                        }}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3"
                        title={t('system.env.sections.aiEngine.logs.refresh')}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {mode === 'raw' && (
                <div className="flex flex-wrap items-center gap-3 border rounded-lg p-3 bg-background">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t('system.env.sections.aiEngine.logs.raw.levels')}</span>
                        {(['error', 'warning', 'info', 'debug'] as LogLevel[]).map(lvl => (
                            <label key={lvl} className="flex items-center gap-1 text-xs">
                                <input
                                    type="checkbox"
                                    checked={rawLevels.includes(lvl)}
                                    onChange={e => {
                                        const next = e.target.checked
                                            ? Array.from(new Set([...rawLevels, lvl]))
                                            : rawLevels.filter(x => x !== lvl);
                                        setRawLevels(next);
                                        updateUrlParams({ raw_levels: next.join(',') });
                                    }}
                                />
                                {lvl}
                            </label>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t('system.env.sections.aiEngine.logs.raw.search')}</span>
                        <input
                            className="h-8 w-[280px] rounded-md border border-input bg-background px-2 py-1 text-xs"
                            placeholder={t('system.env.sections.aiEngine.logs.raw.searchPlaceholder')}
                            value={q}
                            onChange={e => {
                                setQ(e.target.value);
                                updateUrlParams({ q: e.target.value });
                            }}
                        />
                    </div>
                </div>
            )}

            {mode === 'troubleshoot' && showCallFinder && (
                <div className="border rounded-lg p-4 bg-background space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="font-semibold">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.title')}</div>
                        <div className="text-xs text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.desc')}</div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <div className="text-xs text-muted-foreground mb-1">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.callerNumber')}</div>
                            <input
                                className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                placeholder={t('system.env.sections.aiEngine.logs.troubleshoot.findCall.callerNumberPlaceholder')}
                                value={callFilters.caller_number}
                                onChange={e => { setCallPage(1); setCallFilters(f => ({ ...f, caller_number: e.target.value })); }}
                            />
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground mb-1">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.callerName')}</div>
                            <input
                                className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                placeholder={t('system.env.sections.aiEngine.logs.troubleshoot.findCall.callerNamePlaceholder')}
                                value={callFilters.caller_name}
                                onChange={e => { setCallPage(1); setCallFilters(f => ({ ...f, caller_name: e.target.value })); }}
                            />
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground mb-1">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.provider')}</div>
                            <select
                                className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                value={callFilters.provider_name}
                                onChange={e => { setCallPage(1); setCallFilters(f => ({ ...f, provider_name: e.target.value })); }}
                            >
                                <option value="">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.all')}</option>
                                {(callFilterOptions?.providers || []).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground mb-1">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.pipeline')}</div>
                            <select
                                className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                value={callFilters.pipeline_name}
                                onChange={e => { setCallPage(1); setCallFilters(f => ({ ...f, pipeline_name: e.target.value })); }}
                            >
                                <option value="">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.all')}</option>
                                {(callFilterOptions?.pipelines || []).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground mb-1">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.context')}</div>
                            <select
                                className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                value={callFilters.context_name}
                                onChange={e => { setCallPage(1); setCallFilters(f => ({ ...f, context_name: e.target.value })); }}
                            >
                                <option value="">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.all')}</option>
                                {(callFilterOptions?.contexts || []).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground mb-1">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.outcome')}</div>
                            <select
                                className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                value={callFilters.outcome}
                                onChange={e => { setCallPage(1); setCallFilters(f => ({ ...f, outcome: e.target.value })); }}
                            >
                                <option value="">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.all')}</option>
                                {(callFilterOptions?.outcomes || []).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground mb-1">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.fromDate')}</div>
                            <input
                                type="date"
                                className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                value={callFilters.start_date}
                                onChange={e => { setCallPage(1); setCallFilters(f => ({ ...f, start_date: e.target.value })); }}
                            />
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground mb-1">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.toDate')}</div>
                            <input
                                type="date"
                                className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                value={callFilters.end_date}
                                onChange={e => { setCallPage(1); setCallFilters(f => ({ ...f, end_date: e.target.value })); }}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchCalls}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3"
                        >
                            {t('system.env.sections.aiEngine.logs.troubleshoot.findCall.search')}
                        </button>
                        <button
                            onClick={() => { setCallPage(1); setCallFilters({ caller_number: '', caller_name: '', provider_name: '', pipeline_name: '', context_name: '', outcome: '', start_date: '', end_date: '' }); }}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3"
                        >
                            {t('system.env.sections.aiEngine.logs.troubleshoot.findCall.clear')}
                        </button>
                        <div className="text-xs text-muted-foreground">{callLoading ? t('system.env.sections.aiEngine.logs.troubleshoot.findCall.loading') : t('system.env.sections.aiEngine.logs.troubleshoot.findCall.results', { count: callResults.length })}</div>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                        <div className="grid grid-cols-6 gap-2 px-3 py-2 text-xs bg-muted/40 text-muted-foreground">
                            <div>{t('system.env.sections.aiEngine.logs.troubleshoot.table.caller')}</div>
                            <div>{t('system.env.sections.aiEngine.logs.troubleshoot.table.time')}</div>
                            <div>{t('system.env.sections.aiEngine.logs.troubleshoot.table.duration')}</div>
                            <div>{t('system.env.sections.aiEngine.logs.troubleshoot.table.provider')}</div>
                            <div>{t('system.env.sections.aiEngine.logs.troubleshoot.table.context')}</div>
                            <div>{t('system.env.sections.aiEngine.logs.troubleshoot.table.actions')}</div>
                        </div>
                        {callResults.map(r => (
                            <div key={r.id} className="grid grid-cols-6 gap-2 px-3 py-2 text-xs border-t">
                                <div className="truncate">{r.caller_number || t('system.env.sections.aiEngine.logs.troubleshoot.table.unknown')}{r.caller_name ? ` (${r.caller_name})` : ''}</div>
                                <div className="truncate">{r.start_time ? new Date(r.start_time).toLocaleString() : '-'}</div>
                                <div>{Math.round(r.duration_seconds)}s</div>
                                <div className="truncate">{r.provider_name}</div>
                                <div className="truncate">{r.context_name || '-'}</div>
                                <div>
                                    <button
                                        onClick={() => {
                                            setCallId(r.call_id);
                                            setSince(r.start_time || '');
                                            setUntil(r.end_time || '');
                                            setShowCallFinder(false);
                                            setAutoRefresh(false);
                                            updateUrlParams({ mode: 'troubleshoot', call_id: r.call_id, since: r.start_time || '', until: r.end_time || '' });
                                        }}
                                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-2"
                                    >
                                        {t('system.env.sections.aiEngine.logs.troubleshoot.table.troubleshootBtn')}
                                    </button>
                                </div>
                            </div>
                        ))}
                        {!callResults.length && !callLoading && (
                            <div className="px-3 py-4 text-xs text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.findCall.noResults')}</div>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2 text-xs">
                        <button
                            disabled={callPage <= 1}
                            onClick={() => setCallPage(p => Math.max(1, p - 1))}
                            className="rounded-md border px-2 py-1 disabled:opacity-50"
                        >
                            {t('system.env.sections.aiEngine.logs.troubleshoot.pagination.prev')}
                        </button>
                        <span className="text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.pagination.page', { current: callPage, total: callTotalPages })}</span>
                        <button
                            disabled={callPage >= callTotalPages}
                            onClick={() => setCallPage(p => Math.min(callTotalPages, p + 1))}
                            className="rounded-md border px-2 py-1 disabled:opacity-50"
                        >
                            {t('system.env.sections.aiEngine.logs.troubleshoot.pagination.next')}
                        </button>
                    </div>
                </div>
            )}

            {mode === 'troubleshoot' && !showCallFinder && (
                <div className="flex flex-wrap items-center gap-2 border rounded-lg p-3 bg-background">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.view')}</span>
                        <select
                            className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
                            value={view}
                            onChange={e => {
                                const nextView = e.target.value as TroubleshootView;
                                setView(nextView);
                                updateUrlParams({ view: nextView });
                            }}
                        >
                            <option value="overview">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.viewOptions.overview')}</option>
                            <option value="issues">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.viewOptions.issues')}</option>
                            <option value="provider">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.viewOptions.provider')}</option>
                            <option value="media">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.viewOptions.media')}</option>
                            <option value="vad">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.viewOptions.vad')}</option>
                            <option value="tools">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.viewOptions.tools')}</option>
                            <option value="all">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.viewOptions.all')}</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.call')}</span>
                        <input
                            className="h-8 w-[280px] rounded-md border border-input bg-background px-2 py-1 text-xs"
                            placeholder={t('system.env.sections.aiEngine.logs.troubleshoot.filters.callPlaceholder')}
                            value={callId}
                            onChange={e => {
                                setCallId(e.target.value);
                                updateUrlParams({ call_id: e.target.value });
                            }}
                        />
                        <button
                            onClick={() => {
                                setCallId('');
                                setSince('');
                                setUntil('');
                                setShowCallFinder(true);
                                updateUrlParams({ call_id: '', since: '', until: '' });
                            }}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-2"
                            title={t('system.env.sections.aiEngine.logs.troubleshoot.filters.findCallTooltip')}
                        >
                            {t('system.env.sections.aiEngine.logs.troubleshoot.filters.findCallBtn')}
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.search')}</span>
                        <input
                            className="h-8 w-[240px] rounded-md border border-input bg-background px-2 py-1 text-xs"
                            placeholder={t('system.env.sections.aiEngine.logs.troubleshoot.filters.searchPlaceholder')}
                            value={q}
                            onChange={e => {
                                setQ(e.target.value);
                                updateUrlParams({ q: e.target.value });
                            }}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.since')}</span>
                        <input
                            className="h-8 w-[240px] rounded-md border border-input bg-background px-2 py-1 text-xs"
                            placeholder={t('system.env.sections.aiEngine.logs.troubleshoot.filters.sincePlaceholder')}
                            value={since}
                            onChange={e => {
                                setSince(e.target.value);
                                updateUrlParams({ since: e.target.value });
                            }}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.filters.until')}</span>
                        <input
                            className="h-8 w-[240px] rounded-md border border-input bg-background px-2 py-1 text-xs"
                            placeholder={t('system.env.sections.aiEngine.logs.troubleshoot.filters.untilPlaceholder')}
                            value={until}
                            onChange={e => {
                                setUntil(e.target.value);
                                updateUrlParams({ until: e.target.value });
                            }}
                        />
                    </div>

                    <label className="flex items-center gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={hidePayloads}
                            onChange={e => {
                                setHidePayloads(e.target.checked);
                                updateUrlParams({ hide_payloads: e.target.checked ? 'true' : 'false' });
                            }}
                        />
                        {t('system.env.sections.aiEngine.logs.troubleshoot.filters.hidePayloads')}
                    </label>

                    <label className="flex items-center gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={includeDebug}
                            onChange={e => {
                                setIncludeDebug(e.target.checked);
                                updateUrlParams({ include_debug: e.target.checked ? 'true' : 'false' });
                            }}
                        />
                        {t('system.env.sections.aiEngine.logs.troubleshoot.filters.includeDebug')}
                    </label>

                    <label className="flex items-center gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={hideRepeats}
                            onChange={e => {
                                setHideRepeats(e.target.checked);
                                updateUrlParams({ hide_repeats: e.target.checked ? 'true' : 'false' });
                            }}
                        />
                        {t('system.env.sections.aiEngine.logs.troubleshoot.filters.hideRepeats')}
                    </label>
                </div>
            )}

            {mode === 'troubleshoot' && !showCallFinder && (eventsMeta?.call || eventsMeta?.window || (eventsMeta?.related_ids && eventsMeta.related_ids.length > 1)) && (
                <div className="border rounded-lg p-3 bg-background text-xs">
                    {eventsMeta?.call && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <div><span className="text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.meta.caller')}</span> {eventsMeta.call.caller_number || t('system.env.sections.aiEngine.logs.troubleshoot.table.unknown')}{eventsMeta.call.caller_name ? ` (${eventsMeta.call.caller_name})` : ''}</div>
                            <div><span className="text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.meta.provider')}</span> {eventsMeta.call.provider_name}</div>
                            <div><span className="text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.meta.pipeline')}</span> {eventsMeta.call.pipeline_name || 'default'}</div>
                            <div><span className="text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.meta.context')}</span> {eventsMeta.call.context_name || t('system.env.sections.aiEngine.logs.troubleshoot.table.unknown')}</div>
                            <div><span className="text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.meta.outcome')}</span> {eventsMeta.call.outcome}</div>
                            {eventsMeta.call.error_message && <div className="text-red-600"><span className="text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.meta.error')}</span> {eventsMeta.call.error_message}</div>}
                        </div>
                    )}
                    {eventsMeta?.window && (
                        <div className="mt-2 text-muted-foreground">
                            {t('system.env.sections.aiEngine.logs.troubleshoot.meta.window', {
                                source: eventsMeta.window.source
                            })}
                            {eventsMeta.window.since ? t('system.env.sections.aiEngine.logs.troubleshoot.meta.windowSince', { since: eventsMeta.window.since }) : ''}
                            {eventsMeta.window.until ? t('system.env.sections.aiEngine.logs.troubleshoot.meta.windowUntil', { until: eventsMeta.window.until }) : ''}
                        </div>
                    )}
                    {eventsMeta?.related_ids && eventsMeta.related_ids.length > 1 && (
                        <div className="mt-2">
                            <span className="text-muted-foreground">{t('system.env.sections.aiEngine.logs.troubleshoot.meta.relatedIds')}</span>{' '}
                            <span className="font-mono">{eventsMeta.related_ids.join(', ')}</span>
                        </div>
                    )}
                </div>
            )}

            <div
                ref={scrollRef}
                onScroll={recomputePinned}
                className="flex-1 min-h-0 border rounded-lg bg-[#09090b] text-gray-300 font-mono text-xs p-4 overflow-auto shadow-inner relative"
            >
                <div className="absolute top-2 right-2 opacity-50 pointer-events-none">
                    <Terminal className="w-6 h-6" />
                </div>
                {mode === 'troubleshoot' && autoRefresh && !isPinnedToBottom && (
                    <button
                        onClick={() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                        className="absolute bottom-3 right-3 z-10 inline-flex items-center justify-center rounded-md border border-gray-700 bg-black/60 px-3 py-1 text-[10px] text-gray-200 hover:bg-black/80"
                        title={t('system.env.sections.aiEngine.logs.troubleshoot.events.jumpToLatest')}
                    >
                        {t('system.env.sections.aiEngine.logs.troubleshoot.events.jumpToLatest')}
                    </button>
                )}
                {mode === 'troubleshoot' ? (
                    <div className="space-y-1">
                        {(displayEvents.length ? displayEvents : []).map((e: any, idx: number) => (
                            <div key={idx} className="flex gap-2 items-start hover:bg-white/5 px-2 py-1 rounded">
                                <div className="w-[90px] text-gray-500 shrink-0">
                                    {e.ts ? new Date(e.ts).toLocaleTimeString() : '--:--:--'}
                                </div>
                                <div className="shrink-0">{levelBadge(e.level)}</div>
                                <div className="shrink-0">
                                    <span className="inline-flex items-center rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-200 bg-gray-600/10">
                                        {e.category}
                                    </span>
                                </div>
                                {e.milestone && (
                                    <div className="shrink-0">
                                        <span className="inline-flex items-center rounded border border-emerald-800 px-2 py-0.5 text-[10px] text-emerald-200 bg-emerald-600/10">
                                            {t('system.env.sections.aiEngine.logs.troubleshoot.events.milestone')}
                                        </span>
                                    </div>
                                )}
                                {(e.repeat || 1) > 1 && (
                                    <div className="shrink-0">
                                        <span className="inline-flex items-center rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-300 bg-gray-600/10">
                                            x{e.repeat}
                                        </span>
                                    </div>
                                )}
                                <div className="flex-1 break-words">
                                    <div className="text-gray-200">{e.msg}</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">
                                        {e.call_id ? `call_id=${e.call_id} ` : ''}
                                        {e.provider ? `provider=${e.provider} ` : ''}
                                        {e.context ? `context=${e.context} ` : ''}
                                        {formatMeta(e.meta) ? `${formatMeta(e.meta)} ` : ''}
                                        {e.component ? `component=${e.component}` : ''}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {!displayEvents.length && (
                            <div className="text-gray-400">{showCallFinder ? t('system.env.sections.aiEngine.logs.troubleshoot.events.pickCall') : t('system.env.sections.aiEngine.logs.troubleshoot.events.noEvents')}</div>
                        )}
                    </div>
                ) : (
                    <pre className="whitespace-pre-wrap break-all">
                        {logs ? parseAnsi(logs) : (
                            rawLevels.length === 1 && rawLevels[0] === 'debug' ? (
                                <span className="text-gray-400">
                                    {t('system.env.sections.aiEngine.logs.raw.noDebugFound', { container })}
                                </span>
                            ) : rawLevels.length > 0 && !rawLevels.includes('info') && !rawLevels.includes('warning') && !rawLevels.includes('error') ? (
                                <span className="text-gray-400">
                                    {t('system.env.sections.aiEngine.logs.raw.noLogsForLevels', { levels: rawLevels.join(', ') })}
                                </span>
                            ) : t('system.env.sections.aiEngine.logs.raw.noLogsAvailable')
                        )}
                    </pre>
                )}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
};

export default LogsPage;
