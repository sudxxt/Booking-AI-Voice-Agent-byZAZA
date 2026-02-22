import { useState, useEffect, useCallback } from 'react';
import {
    RefreshCw, CheckCircle2, XCircle, AlertCircle, Server, Wifi, WifiOff,
    Copy, Check, Globe, Monitor, Clock, Package, AppWindow, FileText, Loader2
} from 'lucide-react';
import { ConfigSection } from '../../components/ui/ConfigSection';
import { ConfigCard } from '../../components/ui/ConfigCard';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

interface ManifestCheck {
    ok: boolean;
    detail: string;
}

interface Manifest {
    timestamp: string;
    asterisk_found: boolean;
    asterisk_version: string;
    config_dir: string;
    freepbx: { detected: boolean; version: string };
    checks: Record<string, ManifestCheck>;
}

interface LiveStatus {
    ari_reachable: boolean;
    asterisk_version: string | null;
    uptime: string | null;
    last_reload: string | null;
    app_registered: boolean;
    app_name: string;
    modules: Record<string, string>;
}

interface AsteriskStatus {
    mode: 'local' | 'remote';
    manifest: Manifest | null;
    live: LiveStatus;
}

const getModuleDescriptions = (t: any): Record<string, string> => ({
    app_audiosocket: t('system.asterisk.moduleDescriptions.app_audiosocket'),
    res_ari: t('system.asterisk.moduleDescriptions.res_ari'),
    res_stasis: t('system.asterisk.moduleDescriptions.res_stasis'),
    chan_pjsip: t('system.asterisk.moduleDescriptions.chan_pjsip'),
    res_http_websocket: t('system.asterisk.moduleDescriptions.res_http_websocket'),
});

const getConfigCheckLabels = (t: any, appName: string): Record<string, { label: string; fixHint: string }> => ({
    ari_enabled: {
        label: t('system.asterisk.configLabels.ari_enabled.label'),
        fixHint: t('system.asterisk.configLabels.ari_enabled.fixHint'),
    },
    ari_user: {
        label: t('system.asterisk.configLabels.ari_user.label'),
        fixHint: t('system.asterisk.configLabels.ari_user.fixHint'),
    },
    http_enabled: {
        label: t('system.asterisk.configLabels.http_enabled.label'),
        fixHint: t('system.asterisk.configLabels.http_enabled.fixHint'),
    },
    dialplan_context: {
        label: t('system.asterisk.configLabels.dialplan_context.label'),
        fixHint: t('system.asterisk.configLabels.dialplan_context.fixHint', { appName }),
    },
});

const CopyButton = ({ text }: { text: string }) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            // Clipboard may be unavailable in insecure contexts.
        });
    };
    return (
        <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title={t('sidebar.support')}
        >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            {copied ? t('common.copied') || 'Copied' : t('common.copy') || 'Copy'}
        </button>
    );
};

const StatusBadge = ({ ok, label }: { ok: boolean; label?: string }) => (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ok ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
        }`}>
        {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {label || (ok ? 'OK' : 'Issue')}
    </span>
);

const formatUptime = (isoStr: string | null): string => {
    if (!isoStr) return '—';
    try {
        const start = new Date(isoStr);
        const now = new Date();
        const diffMs = now.getTime() - start.getTime();
        const days = Math.floor(diffMs / 86400000);
        const hours = Math.floor((diffMs % 86400000) / 3600000);
        if (days > 0) return `${days}d ${hours}h`;
        const mins = Math.floor((diffMs % 3600000) / 60000);
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    } catch {
        return isoStr;
    }
};

const AsteriskPage = () => {
    const { t } = useTranslation();
    const [status, setStatus] = useState<AsteriskStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedFixes, setExpandedFixes] = useState<Record<string, boolean>>({});

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/system/asterisk-status');
            setStatus(res.data);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || t('system.asterisk.fetchFailed'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    const toggleFix = (key: string) => {
        setExpandedFixes(prev => ({ ...prev, [key]: !prev[key] }));
    };

    if (loading && !status) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error && !status) {
        return (
            <div className="p-6">
                <div className="flex items-center gap-2 text-red-500 mb-4">
                    <AlertCircle className="w-5 h-5" />
                    <span>{error}</span>
                </div>
                <button onClick={fetchStatus} className="flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:opacity-90">
                    <RefreshCw className="w-4 h-4" /> {t('system.asterisk.retry')}
                </button>
            </div>
        );
    }

    const live = status?.live;
    const manifest = status?.manifest;
    const mode = status?.mode;
    const appName = live?.app_name || 'asterisk-ai-voice-agent';

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Server className="w-6 h-6 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{t('system.asterisk.title')}</h1>
                        <p className="text-sm text-muted-foreground">
                            {t('system.asterisk.desc')}
                        </p>
                    </div>
                    <span className={`ml-2 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${mode === 'local'
                        ? 'bg-blue-500/10 text-blue-500'
                        : mode === 'remote'
                            ? 'bg-purple-500/10 text-purple-500'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                        {mode === 'local'
                            ? <Monitor className="w-3 h-3" />
                            : mode === 'remote'
                                ? <Globe className="w-3 h-3" />
                                : <AlertCircle className="w-3 h-3" />}
                        {mode === 'local' ? t('system.asterisk.local') : mode === 'remote' ? t('system.asterisk.remote') : t('system.asterisk.unknown')}
                    </span>
                </div>
                <button
                    onClick={fetchStatus}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {t('system.asterisk.refresh')}
                </button>
            </div>

            {/* Connection Card */}
            <ConfigSection title={t('system.asterisk.connected')} description={t('system.asterisk.desc')}>
                <ConfigCard>
                    <div className="flex items-center gap-3 mb-4">
                        {live?.ari_reachable ? (
                            <Wifi className="w-5 h-5 text-green-500" />
                        ) : (
                            <WifiOff className="w-5 h-5 text-red-500" />
                        )}
                        <span className={`text-lg font-semibold ${live?.ari_reachable ? 'text-green-500' : 'text-red-500'}`}>
                            {live?.ari_reachable ? t('system.asterisk.connected') : t('system.asterisk.notReachable')}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <span className="text-muted-foreground">{t('system.asterisk.version')}</span>
                            <p className="font-medium">{live?.asterisk_version || '—'}</p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">{t('system.asterisk.uptime')}</span>
                            <p className="font-medium">{formatUptime(live?.uptime || null)}</p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">{t('system.asterisk.lastReload')}</span>
                            <p className="font-medium">{live?.last_reload ? new Date(live.last_reload).toLocaleString() : '—'}</p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">{t('system.asterisk.mode')}</span>
                            <p className="font-medium capitalize">{mode === 'local' ? t('system.asterisk.local') : mode === 'remote' ? t('system.asterisk.remote') : mode}</p>
                        </div>
                    </div>
                    {manifest?.freepbx?.detected && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                            <FileText className="w-4 h-4" />
                            {t('system.asterisk.freepbxDetected', { version: manifest.freepbx.version || 'detected' })}
                            {manifest.config_dir && <span className="ml-2">({manifest.config_dir})</span>}
                        </div>
                    )}
                </ConfigCard>
            </ConfigSection>

            {/* Modules Checklist */}
            <ConfigSection title={t('system.asterisk.modulesTitle')} description={t('system.asterisk.modulesDesc')}>
                <ConfigCard>
                    {live?.ari_reachable && Object.keys(live.modules).length > 0 ? (
                        <div className="divide-y divide-border">
                            {Object.entries(live.modules).map(([mod, moduleStatus]) => {
                                const isRunning = moduleStatus === 'Running';
                                const moduleDescriptions = getModuleDescriptions(t);
                                return (
                                    <div key={mod} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                                        <div className="flex items-center gap-3">
                                            <Package className="w-4 h-4 text-muted-foreground" />
                                            <div>
                                                <span className="text-sm font-medium">{mod}.so</span>
                                                <p className="text-xs text-muted-foreground">
                                                    {moduleDescriptions[mod] || ''}
                                                </p>
                                            </div>
                                        </div>
                                        <StatusBadge ok={isRunning} label={moduleStatus} />
                                    </div>
                                );
                            })}
                        </div>
                    ) : !live?.ari_reachable ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertCircle className="w-4 h-4" />
                            {t('system.asterisk.modulesRequiresAri')}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertCircle className="w-4 h-4" />
                            {t('system.asterisk.modulesNoData')}
                        </div>
                    )}
                </ConfigCard>
            </ConfigSection>

            {/* App Registration */}
            <ConfigSection title={t('system.asterisk.appTitle')} description={t('system.asterisk.appDesc')}>
                <ConfigCard>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <AppWindow className="w-4 h-4 text-muted-foreground" />
                            <div>
                                <span className="text-sm font-medium">{appName}</span>
                                <p className="text-xs text-muted-foreground">{t('system.asterisk.stasisApp')}</p>
                            </div>
                        </div>
                        {live?.ari_reachable ? (
                            <StatusBadge ok={live?.app_registered || false} label={live?.app_registered ? t('system.asterisk.registered') : t('system.asterisk.notRegistered')} />
                        ) : (
                            <span className="text-xs text-muted-foreground">{t('system.asterisk.requiresAri')}</span>
                        )}
                    </div>
                    {live?.ari_reachable && !live?.app_registered && (
                        <div className="mt-3 p-3 rounded-md bg-amber-500/5 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-400">
                            {t('system.asterisk.appNotRegisteredHint')}
                        </div>
                    )}
                </ConfigCard>
            </ConfigSection>

            {/* Configuration Checklist (from manifest) */}
            <ConfigSection title={t('system.asterisk.checklistTitle')} description={t('system.asterisk.checklistDesc')}>
                <ConfigCard>
                    {manifest && manifest.checks && Object.keys(manifest.checks).length > 0 ? (
                        <div className="divide-y divide-border">
                            {Object.entries(manifest.checks).map(([key, check]) => {
                                const configCheckLabels = getConfigCheckLabels(t, appName);
                                const meta = configCheckLabels[key];
                                const label = meta?.label || key.replace(/_/g, ' ').replace(/^module /, '');
                                const isModule = key.startsWith('module_');
                                // Actually fixHint in CONFIG_CHECK_LABELS was already being used.
                                const metaFixHint = (meta?.fixHint || '').replace('{appName}', appName);

                                return (
                                    <div key={key} className="py-2.5 first:pt-0 last:pb-0">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {isModule ? (
                                                    <Package className="w-4 h-4 text-muted-foreground" />
                                                ) : (
                                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                                )}
                                                <div>
                                                    <span className="text-sm font-medium">{label}</span>
                                                    <p className="text-xs text-muted-foreground">{check.detail}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <StatusBadge ok={check.ok} />
                                                {!check.ok && metaFixHint && (
                                                    <button
                                                        onClick={() => toggleFix(key)}
                                                        className="text-xs text-primary hover:underline"
                                                    >
                                                        {expandedFixes[key] ? t('system.asterisk.hideFix') : t('system.asterisk.howToFix')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {!check.ok && metaFixHint && expandedFixes[key] && (
                                            <div className="mt-2 ml-7">
                                                <div className="relative">
                                                    <pre className="p-3 rounded-md bg-muted text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                                                        {metaFixHint}
                                                    </pre>
                                                    <div className="absolute top-2 right-2">
                                                        <CopyButton text={metaFixHint} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (manifest === null || manifest === undefined) ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertCircle className="w-4 h-4" />
                            <div>
                                <p>{t('system.asterisk.noManifest')}</p>
                                <p className="mt-1">{t('system.asterisk.runPreflight')}</p>
                            </div>
                        </div>
                    ) : (manifest && manifest.checks && Object.keys(manifest.checks).length === 0) ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                            <div>
                                <p>{t('system.asterisk.preflightNotRun')}</p>
                                <p className="mt-1">{t('system.asterisk.runPreflightLong')}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            {t('system.asterisk.noIssues')}
                        </div>
                    )}
                </ConfigCard>
            </ConfigSection>

            {/* Manifest Info */}
            {
                manifest && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {t('system.asterisk.lastPreflight', { time: manifest.timestamp ? new Date(manifest.timestamp).toLocaleString() : t('system.asterisk.unknown') })}
                        <span className="ml-2">•</span>
                        <span>{t('system.asterisk.runPreflightRefresh')}</span>
                    </div>
                )
            }
        </div>
    );
};

export default AsteriskPage;
