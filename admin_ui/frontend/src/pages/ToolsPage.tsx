import { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import yaml from 'js-yaml';
import { Save, AlertCircle, RefreshCw, Loader2, Phone, Webhook, Search, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { YamlErrorBanner, YamlErrorInfo } from '../components/ui/YamlErrorBanner';
import { ConfigSection } from '../components/ui/ConfigSection';
import { ConfigCard } from '../components/ui/ConfigCard';
import ToolForm from '../components/config/ToolForm';
import HTTPToolForm from '../components/config/HTTPToolForm';
import { useAuth } from '../auth/AuthContext';
import { sanitizeConfigForSave } from '../utils/configSanitizers';
import { useTranslation } from 'react-i18next';

type ToolPhase = 'in_call' | 'pre_call' | 'post_call' | 'catalog';

type ToolParam = {
    name: string;
    type: string;
    description: string;
    required?: boolean;
};

type ToolDef = {
    name: string;
    description: string;
    category?: string;
    phase?: string;
    is_global?: boolean;
    source?: 'builtin' | 'http' | 'mcp' | 'unknown' | string;
    parameters?: ToolParam[];
};

const ToolsPage = () => {
    const { t } = useTranslation();
    const { confirm } = useConfirmDialog();
    const { token } = useAuth();
    const [config, setConfig] = useState<any>({});
    const configRef = useRef<any>({});
    const [loading, setLoading] = useState(true);
    const [yamlError, setYamlError] = useState<YamlErrorInfo | null>(null);
    const [saving, setSaving] = useState(false);
    const [pendingRestart, setPendingRestart] = useState(false);
    const [restartingEngine, setRestartingEngine] = useState(false);
    const [activePhase, setActivePhase] = useState<ToolPhase>('in_call');
    const [toolCatalog, setToolCatalog] = useState<ToolDef[]>([]);
    const [toolCatalogError, setToolCatalogError] = useState<string | null>(null);
    const [toolCatalogLoading, setToolCatalogLoading] = useState(false);
    const [toolCatalogQuery, setToolCatalogQuery] = useState('');
    const [toolCatalogExpanded, setToolCatalogExpanded] = useState<Record<string, boolean>>({});

    const hangupUsage = useMemo(() => {
        const providers = (config && typeof config === 'object') ? (config as any).providers : null;
        const googleLiveMarkersEnabledRaw = providers?.google_live?.hangup_markers_enabled;
        const googleLiveMarkersEnabled =
            googleLiveMarkersEnabledRaw === true ? true : googleLiveMarkersEnabledRaw === false ? false : null;

        const pipelines = (config && typeof config === 'object') ? (config as any).pipelines : null;
        const pipelineEndCallOverrides: string[] = [];
        const pipelineModeOverrides: { name: string; mode: string }[] = [];
        const pipelineGuardrailOverrides: { name: string; enabled: boolean }[] = [];

        if (pipelines && typeof pipelines === 'object' && !Array.isArray(pipelines)) {
            Object.entries(pipelines).forEach(([name, pipeline]) => {
                const llmOpts = (pipeline as any)?.options?.llm;
                const end = llmOpts?.hangup_call_guardrail_markers?.end_call;
                if (Array.isArray(end) && end.length > 0) {
                    pipelineEndCallOverrides.push(name);
                }
                const mode = String(llmOpts?.hangup_call_guardrail_mode || '').trim();
                if (mode) {
                    pipelineModeOverrides.push({ name, mode });
                }
                const enabled = llmOpts?.hangup_call_guardrail;
                if (enabled === true || enabled === false) {
                    pipelineGuardrailOverrides.push({ name, enabled });
                }
            });
        }

        return {
            googleLiveMarkersEnabled,
            pipelineEndCallOverrides,
            pipelineModeOverrides,
            pipelineGuardrailOverrides,
        };
    }, [config]);

    useEffect(() => {
        fetchConfig();
        fetchToolCatalog();
    }, []);

    useEffect(() => {
        configRef.current = config;
    }, [config]);

    const fetchConfig = async () => {
        try {
            const res = await axios.get('/api/config/yaml');
            if (res.data.yaml_error) {
                setYamlError(res.data.yaml_error);
                setConfig({});
            } else {
                const parsed = yaml.load(res.data.content) as any;
                setConfig(parsed || {});
                setYamlError(null);
            }
        } catch (err) {
            console.error('Failed to load config', err);
            setYamlError(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchToolCatalog = async () => {
        setToolCatalogLoading(true);
        try {
            const res = await axios.get('/api/tools/catalog');
            const tools = (res.data && Array.isArray(res.data.tools)) ? res.data.tools : [];
            setToolCatalog(tools);
            setToolCatalogError(null);
        } catch (err: any) {
            console.error('Failed to load tool catalog', err);
            setToolCatalog([]);
            setToolCatalogError(err?.response?.data?.detail || err?.message || 'Failed to load tool catalog');
        } finally {
            setToolCatalogLoading(false);
        }
    };

    const persistConfigNow = async (nextConfig: any, successToast?: string) => {
        setSaving(true);
        try {
            const sanitized = sanitizeConfigForSave(nextConfig);
            await axios.post('/api/config/yaml', { content: yaml.dump(sanitized) }, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 30000  // 30 second timeout
            });
            setPendingRestart(true);
            if (successToast) toast.success(successToast);
        } catch (err: any) {
            console.error('Failed to save config', err);
            const detail = err.response?.data?.detail || err.message || 'Unknown error';
            toast.error(t('toolsPage.toasts.saveFailed'), { description: detail });
            throw err;
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        await persistConfigNow(configRef.current, t('toolsPage.toasts.saveSuccess'));
    };

    const handleRestartAIEngine = async (force: boolean = false) => {
        setRestartingEngine(true);
        try {
            const response = await axios.post(`/api/system/containers/ai_engine/restart?force=${force}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.status === 'warning') {
                const confirmForce = await confirm({
                    title: t('restart.confirmTitleForce'),
                    description: t('restart.confirmDescForce', { message: response.data.message }),
                    confirmText: t('restart.btnForce'),
                    variant: 'destructive'
                });
                if (confirmForce) {
                    setRestartingEngine(false);
                    return handleRestartAIEngine(true);
                }
                return;
            }

            if (response.data.status === 'degraded') {
                toast.warning(t('errors.degraded'), { description: response.data.output || t('errors.degradedDesc') });
                return;
            }

            setPendingRestart(false);
            toast.success(t('errors.success'));
        } catch (error: any) {
            toast.error(t('errors.restartFailed'), { description: error.response?.data?.detail || error.message });
        } finally {
            setRestartingEngine(false);
        }
    };

    const mergeToolsConfig = (baseConfig: any, newToolsConfig: any) => {
        // Extract root-level settings that should not be nested under tools
        const { farewell_hangup_delay_sec, ...toolsOnly } = newToolsConfig;

        // P1 Fix: Preserve ALL existing tool entries that are not being explicitly updated.
        // This prevents silent config loss of custom/unknown tool entries.
        // Built-in tools that ToolForm manages: transfer, hangup_call, leave_voicemail, 
        // send_email_summary, request_transcript
        const builtInToolKeys = ['transfer', 'attended_transfer', 'cancel_transfer', 'hangup_call', 'leave_voicemail', 'send_email_summary', 'request_transcript'];

        const existingTools = baseConfig.tools || {};
        const preservedTools: Record<string, any> = {};

        Object.entries(existingTools).forEach(([k, v]) => {
            // Preserve if:
            // 1. It's a phase-based HTTP tool (has kind and phase)
            // 2. It's NOT a built-in tool that ToolForm manages (those get updated from toolsOnly)
            const isPhaseHttpTool = v && typeof v === 'object' && (v as any).kind && (v as any).phase;
            const isBuiltInTool = builtInToolKeys.includes(k);

            if (isPhaseHttpTool || !isBuiltInTool) {
                // Only preserve if not being explicitly set in toolsOnly
                if (!(k in toolsOnly)) {
                    preservedTools[k] = v;
                }
            }
        });

        // Update both tools config and root-level farewell_hangup_delay_sec
        const updatedConfig = { ...baseConfig, tools: { ...preservedTools, ...toolsOnly } };
        if (farewell_hangup_delay_sec !== undefined) {
            updatedConfig.farewell_hangup_delay_sec = farewell_hangup_delay_sec;
        }
        return updatedConfig;
    };

    const updateToolsConfig = (newToolsConfig: any) => {
        setConfig((prev: any) => mergeToolsConfig(prev, newToolsConfig));
    };

    const updateToolsConfigAndSaveNow = async (newToolsConfig: any) => {
        const nextConfig = mergeToolsConfig(configRef.current, newToolsConfig);
        setConfig(nextConfig);
        await persistConfigNow(nextConfig);
    };

    if (loading) return <div className="p-8 text-center text-muted-foreground">Loading configuration...</div>;
    if (yamlError) {
        return (
            <div className="space-y-4 p-6">
                <YamlErrorBanner error={yamlError} />
                <div className="flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-400">
                    <div className="flex items-center">
                        <AlertCircle className="mr-2 h-5 w-5" />
                        {t('toolsPage.yamlError')}
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="flex items-center text-xs px-3 py-1.5 rounded transition-colors bg-red-500 text-white hover:bg-red-600 font-medium"
                    >
                        {t('toolsPage.reload')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className={`${pendingRestart ? 'bg-orange-500/15 border-orange-500/30' : 'bg-yellow-500/10 border-yellow-500/20'} border text-yellow-600 dark:text-yellow-500 p-4 rounded-md flex items-center justify-between`}>
                <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {t('toolsPage.restartWarning')}
                </div>
                <button
                    onClick={() => handleRestartAIEngine(false)}
                    disabled={restartingEngine || !pendingRestart}
                    className={`flex items-center text-xs px-3 py-1.5 rounded transition-colors ${pendingRestart
                        ? 'bg-orange-500 text-white hover:bg-orange-600 font-medium'
                        : 'bg-yellow-500/20 hover:bg-yellow-500/30'
                        } disabled:opacity-50`}
                >
                    {restartingEngine ? (
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    ) : (
                        <RefreshCw className="w-3 h-3 mr-1.5" />
                    )}
                    {restartingEngine ? t('toolsPage.restarting') : t('toolsPage.restartEngine')}
                </button>
            </div>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('toolsPage.title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {t('toolsPage.description')}
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? t('toolsPage.saving') : t('toolsPage.saveChanges')}
                </button>
            </div>

            {/* Phase Tabs */}
            <div className="border-b border-border">
                <div className="flex space-x-1">
                    <button
                        onClick={() => setActivePhase('pre_call')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activePhase === 'pre_call'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                            }`}
                    >
                        <Search className="w-4 h-4" />
                        {t('toolsPage.tabs.preCall')}
                    </button>
                    <button
                        onClick={() => setActivePhase('in_call')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activePhase === 'in_call'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                            }`}
                    >
                        <Phone className="w-4 h-4" />
                        {t('toolsPage.tabs.inCall')}
                    </button>
                    <button
                        onClick={() => setActivePhase('post_call')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activePhase === 'post_call'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                            }`}
                    >
                        <Webhook className="w-4 h-4" />
                        {t('toolsPage.tabs.postCall')}
                    </button>
                    <button
                        onClick={() => setActivePhase('catalog')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activePhase === 'catalog'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                            }`}
                    >
                        <BookOpen className="w-4 h-4" />
                        {t('toolsPage.tabs.catalog')}
                    </button>
                </div>
            </div>

            {/* Pre-Call Phase */}
            {activePhase === 'pre_call' && (
                <ConfigSection
                    title={t('toolsPage.sections.preCallTitle')}
                    description={t('toolsPage.sections.preCallDesc')}
                >
                    <ConfigCard>
                        <HTTPToolForm
                            config={config.tools || {}}
                            onChange={(newTools) => setConfig({ ...config, tools: newTools })}
                            phase="pre_call"
                            contexts={config.contexts}
                        />
                    </ConfigCard>
                </ConfigSection>
            )}

            {/* In-Call Phase (existing tools + HTTP tools) */}
            {activePhase === 'in_call' && (
                <>
                    <ConfigSection title={t('toolsPage.sections.inCallTitle')} description={t('toolsPage.sections.inCallDesc')}>
                        <ConfigCard>
                            <ToolForm
                                config={{ ...(config.tools || {}), farewell_hangup_delay_sec: config.farewell_hangup_delay_sec }}
                                contexts={config.contexts || {}}
                                hangupUsage={hangupUsage}
                                onChange={updateToolsConfig}
                                onSaveNow={updateToolsConfigAndSaveNow}
                            />
                        </ConfigCard>
                    </ConfigSection>
                    <ConfigSection
                        title={t('toolsPage.sections.inCallHttpTitle')}
                        description={t('toolsPage.sections.inCallHttpDesc')}
                    >
                        <ConfigCard>
                            <HTTPToolForm
                                config={config.in_call_tools || {}}
                                onChange={(newTools) => setConfig({ ...config, in_call_tools: newTools })}
                                phase="in_call"
                                contexts={config.contexts}
                            />
                        </ConfigCard>
                    </ConfigSection>
                </>
            )}

            {/* Post-Call Phase */}
            {activePhase === 'post_call' && (
                <ConfigSection
                    title={t('toolsPage.sections.postCallTitle')}
                    description={t('toolsPage.sections.postCallDesc')}
                >
                    <ConfigCard>
                        <HTTPToolForm
                            config={config.tools || {}}
                            onChange={(newTools) => setConfig({ ...config, tools: newTools })}
                            phase="post_call"
                            contexts={config.contexts}
                        />
                    </ConfigCard>
                </ConfigSection>
            )}

            {activePhase === 'catalog' && (
                <ConfigSection
                    title={t('toolsPage.sections.catalogTitle')}
                    description={t('toolsPage.sections.catalogDesc')}
                >
                    <ConfigCard>
                        <div className="space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center gap-3">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        className="w-full pl-10 pr-3 py-2 rounded border border-input bg-background text-sm"
                                        placeholder={t('toolsPage.catalog.searchPlaceholder')}
                                        value={toolCatalogQuery}
                                        onChange={(e) => setToolCatalogQuery(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchToolCatalog}
                                    disabled={toolCatalogLoading}
                                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                                >
                                    {toolCatalogLoading ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-4 h-4 mr-2" />
                                    )}
                                    {t('toolsPage.catalog.refresh')}
                                </button>
                            </div>

                            {toolCatalogError && (
                                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
                                    {toolCatalogError}
                                </div>
                            )}

                            <div className="overflow-x-auto border border-border rounded-md">
                                <table className="w-full text-sm">
                                    <thead className="bg-secondary/40 text-muted-foreground">
                                        <tr>
                                            <th className="text-left px-3 py-2 w-10"></th>
                                            <th className="text-left px-3 py-2">{t('toolsPage.catalog.columns.tool')}</th>
                                            <th className="text-left px-3 py-2">{t('toolsPage.catalog.columns.phase')}</th>
                                            <th className="text-left px-3 py-2">{t('toolsPage.catalog.columns.source')}</th>
                                            <th className="text-left px-3 py-2">{t('toolsPage.catalog.columns.description')}</th>
                                            <th className="text-left px-3 py-2 w-16">{t('toolsPage.catalog.columns.params')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const q = toolCatalogQuery.trim().toLowerCase();
                                            const filtered = (toolCatalog || [])
                                                .filter((tool) => {
                                                    if (!q) return true;
                                                    const hay = [
                                                        tool.name,
                                                        tool.description,
                                                        tool.phase,
                                                        tool.source,
                                                        tool.category,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' ')
                                                        .toLowerCase();
                                                    return hay.includes(q);
                                                })
                                                .sort((a, b) => a.name.localeCompare(b.name));

                                            if (toolCatalogLoading && filtered.length === 0) {
                                                return (
                                                    <tr>
                                                        <td className="px-3 py-3" colSpan={6}>
                                                            <div className="flex items-center text-muted-foreground">
                                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                                {t('toolsPage.catalog.loading')}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            if (filtered.length === 0) {
                                                return (
                                                    <tr>
                                                        <td className="px-3 py-3 text-muted-foreground" colSpan={6}>
                                                            {t('toolsPage.catalog.noTools')}
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            return filtered.flatMap((tool) => {
                                                const expanded = !!toolCatalogExpanded[tool.name];
                                                const params = Array.isArray(tool.parameters) ? tool.parameters : [];
                                                return [
                                                    (
                                                        <tr key={tool.name} className="border-t border-border align-top">
                                                            <td className="px-3 py-2">
                                                                <button
                                                                    type="button"
                                                                    className="text-muted-foreground hover:text-foreground"
                                                                    onClick={() => setToolCatalogExpanded((prev) => ({ ...prev, [tool.name]: !expanded }))}
                                                                    aria-label={expanded ? 'Collapse tool details' : 'Expand tool details'}
                                                                >
                                                                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                                </button>
                                                            </td>
                                                            <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                                                                {tool.name}
                                                                {tool.is_global ? (
                                                                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary/40 text-muted-foreground">
                                                                        {t('toolsPage.catalog.global')}
                                                                    </span>
                                                                ) : null}
                                                            </td>
                                                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{tool.phase || '-'}</td>
                                                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{tool.source || t('toolsPage.catalog.unknown')}</td>
                                                            <td className="px-3 py-2 text-foreground/90">{tool.description || '-'}</td>
                                                            <td className="px-3 py-2 text-muted-foreground text-right">{params.length}</td>
                                                        </tr>
                                                    ),
                                                    expanded ? (
                                                        <tr key={`${tool.name}-details`} className="border-t border-border bg-secondary/20">
                                                            <td className="px-3 py-2" colSpan={6}>
                                                                {params.length === 0 ? (
                                                                    <div className="text-xs text-muted-foreground">{t('toolsPage.catalog.noParams')}</div>
                                                                ) : (
                                                                    <div className="space-y-2">
                                                                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('toolsPage.catalog.parameters')}</div>
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                            {params.map((p) => (
                                                                                <div key={`${tool.name}-${p.name}`} className="rounded border border-border bg-background/60 p-2">
                                                                                    <div className="flex items-center justify-between">
                                                                                        <div className="text-xs font-medium text-foreground">
                                                                                            {p.name}{p.required ? <span className="ml-1 text-red-500">*</span> : null}
                                                                                        </div>
                                                                                        <div className="text-[10px] text-muted-foreground">{p.type}</div>
                                                                                    </div>
                                                                                    <div className="text-xs text-muted-foreground mt-1">{p.description || '-'}</div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ) : null,
                                                ].filter(Boolean) as any;
                                            });
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </ConfigCard>
                </ConfigSection>
            )}
        </div>
    );
};

export default ToolsPage;
