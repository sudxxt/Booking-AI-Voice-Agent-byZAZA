import React, { useEffect, useMemo, useState } from 'react';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import axios from 'axios';
import { toast } from 'sonner';
import yaml from 'js-yaml';
import { Plus, Save, Play, RefreshCw, AlertCircle, Settings2, Trash2 } from 'lucide-react';
import { YamlErrorBanner, YamlErrorInfo } from '../components/ui/YamlErrorBanner';
import { ConfigSection } from '../components/ui/ConfigSection';
import { ConfigCard } from '../components/ui/ConfigCard';
import { Modal } from '../components/ui/Modal';
import { FormInput, FormLabel } from '../components/ui/FormComponents';
import { sanitizeConfigForSave } from '../utils/configSanitizers';
import { useTranslation } from 'react-i18next';

type MCPStatus = {
    enabled: boolean;
    servers: Record<string, any>;
    tool_routes?: Record<string, any>;
};

type ServerForm = {
    id: string;
    enabled: boolean;
    transport: string;
    commandExec: string;
    commandArgs: string;
    cwd?: string;
    defaults: {
        timeout_ms: number;
        slow_response_threshold_ms: number;
        slow_response_message: string;
    };
    restart: {
        enabled: boolean;
        max_restarts: number;
        backoff_ms: number;
    };
    env: Array<{ key: string; value: string; redacted?: boolean }>;
    tools: Array<{
        name: string;
        expose_as?: string;
        description?: string;
        speech_field?: string;
        speech_template?: string;
        timeout_ms?: number;
        slow_response_threshold_ms?: number;
        slow_response_message?: string;
    }>;
};

const _parseArgLine = (raw: string): string[] => {
    const s = (raw || '').trim();
    if (!s) return [];
    return s.split(/\s+/g).filter(Boolean);
};

const MCPPage = () => {
    const { t } = useTranslation();
    const { confirm } = useConfirmDialog();
    const [config, setConfig] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [yamlError, setYamlError] = useState<YamlErrorInfo | null>(null);
    const [saving, setSaving] = useState(false);
    const [reloadingEngine, setReloadingEngine] = useState(false);
    const [status, setStatus] = useState<MCPStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(false);
    const [editing, setEditing] = useState(false);
    const [serverForm, setServerForm] = useState<ServerForm | null>(null);
    const [testRunning, setTestRunning] = useState<Record<string, boolean>>({});

    useEffect(() => {
        fetchAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchAll = async () => {
        setLoading(true);
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
        await fetchStatus();
    };

    const fetchStatus = async () => {
        setStatusLoading(true);
        try {
            const res = await axios.get('/api/mcp/status');
            setStatus(res.data);
        } catch (err) {
            console.warn('Failed to load MCP status (ai-engine may be down)', err);
            setStatus(null);
        } finally {
            setStatusLoading(false);
        }
    };

    const mcpConfig = config.mcp || {};
    const servers: Record<string, any> = mcpConfig.servers || {};

    const handleSave = async () => {
        setSaving(true);
        try {
            const sanitized = sanitizeConfigForSave(config);
            await axios.post('/api/config/yaml', { content: yaml.dump(sanitized) });
            try {
                setReloadingEngine(true);
                const res = await axios.post('/api/system/containers/ai_engine/reload');
                if (res.data?.restart_required) {
                    toast.warning(t('mcpPage.toasts.saveSuccessRestartReq'));
                } else {
                    toast.success(t('mcpPage.toasts.saveSuccess'));
                }
            } catch (err: any) {
                toast.warning(t('mcpPage.toasts.saveSuccess'), { description: `${t('mcpPage.toasts.aiReloadFailed')}: ${err.response?.data?.detail || err.message}` });
            } finally {
                setReloadingEngine(false);
                await fetchStatus();
            }
        } catch (err) {
            console.error('Failed to save config', err);
            toast.error(t('mcpPage.toasts.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const updateMcp = (patch: any) => {
        setConfig({ ...config, mcp: { ...(config.mcp || {}), ...patch } });
    };

    const openAddServer = () => {
        setServerForm({
            id: '',
            enabled: true,
            transport: 'stdio',
            commandExec: '',
            commandArgs: '',
            cwd: '',
            defaults: {
                timeout_ms: 10000,
                slow_response_threshold_ms: 0,
                slow_response_message: 'Let me look that up for you, one moment...',
            },
            restart: { enabled: true, max_restarts: 5, backoff_ms: 1000 },
            env: [],
            tools: [],
        });
        setEditing(true);
    };

    const openEditServer = (id: string) => {
        const s = servers[id] || {};
        const cmd = Array.isArray(s.command) ? s.command : [];
        setServerForm({
            id,
            enabled: s.enabled !== false,
            transport: s.transport || 'stdio',
            commandExec: cmd[0] || '',
            commandArgs: (cmd.slice(1) || []).join(' '),
            cwd: s.cwd || '',
            defaults: {
                timeout_ms: s.defaults?.timeout_ms ?? 10000,
                slow_response_threshold_ms: s.defaults?.slow_response_threshold_ms ?? 0,
                slow_response_message: s.defaults?.slow_response_message ?? 'Let me look that up for you, one moment...',
            },
            restart: {
                enabled: s.restart?.enabled ?? true,
                max_restarts: s.restart?.max_restarts ?? 5,
                backoff_ms: s.restart?.backoff_ms ?? 1000,
            },
            env: Object.entries(s.env || {}).map(([k, v]: any) => {
                const value = String(v);
                const isRef = /^\$\{[A-Za-z0-9_]+\}$/.test(value);
                return isRef ? { key: String(k), value } : { key: String(k), value: '', redacted: true };
            }),
            tools: Array.isArray(s.tools) ? s.tools : [],
        });
        setEditing(true);
    };

    const saveServerForm = async () => {
        if (!serverForm) return;
        const id = (serverForm.id || '').trim();
        if (!id) {
            toast.error(t('mcpPage.toasts.idRequired'));
            return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(id)) {
            toast.error(t('mcpPage.toasts.idSafe'));
            return;
        }
        const cmd = [serverForm.commandExec.trim(), ..._parseArgLine(serverForm.commandArgs)].filter(Boolean);
        if (cmd.length === 0) {
            toast.error(t('mcpPage.toasts.cmdRequired'));
            return;
        }

        const envObj: Record<string, string> = {};
        for (const row of serverForm.env) {
            const k = (row.key || '').trim();
            if (!k) continue;
            const v = String(row.value || '').trim();
            if (row.redacted && !v) {
                const existing = servers[id]?.env?.[k];
                if (typeof existing === 'string') envObj[k] = existing;
                continue;
            }
            envObj[k] = v;
        }
        const unsafeEnv = Object.entries(envObj).filter(([_k, v]) => v && !/^\$\{[A-Za-z0-9_]+\}$/.test(v));
        if (unsafeEnv.length > 0) {
            const names = unsafeEnv.map(([k]) => k).join(', ');
            const confirmed = await confirm({
                title: t('mcpPage.toasts.securityRiskTitle'),
                description: t('mcpPage.toasts.securityRiskDesc', { names }),
                confirmText: t('mcpPage.toasts.confirmAnyway'),
                variant: 'destructive'
            });
            if (!confirmed) return;
        }

        const toolList = (serverForm.tools || [])
            .map((tLoc) => ({ ...tLoc, name: String(tLoc.name || '').trim(), expose_as: tLoc.expose_as ? String(tLoc.expose_as).trim() : undefined }))
            .filter((tLoc) => !!tLoc.name);
        const seenToolNames = new Set<string>();
        for (const tLoc of toolList) {
            if (seenToolNames.has(tLoc.name)) {
                toast.error(t('mcpPage.toasts.dupToolName', { name: tLoc.name }));
                return;
            }
            seenToolNames.add(tLoc.name);
            if (tLoc.expose_as && !/^[a-zA-Z0-9_]+$/.test(tLoc.expose_as)) {
                toast.error(t('mcpPage.toasts.invalidExposeAs', { name: tLoc.expose_as }));
                return;
            }
        }

        const nextServers = { ...servers };
        nextServers[id] = {
            enabled: !!serverForm.enabled,
            transport: serverForm.transport || 'stdio',
            command: cmd,
            cwd: (serverForm.cwd || '').trim() || undefined,
            env: envObj,
            defaults: serverForm.defaults,
            restart: serverForm.restart,
            tools: toolList,
        };

        updateMcp({ enabled: mcpConfig.enabled ?? false, servers: nextServers });
        setEditing(false);
        setServerForm(null);
    };

    const deleteServer = async (id: string) => {
        const confirmed = await confirm({
            title: t('mcpPage.toasts.deleteMcpTitle'),
            description: t('mcpPage.toasts.deleteMcpDesc', { id }),
            confirmText: t('mcpPage.toasts.deleteObjBtn'),
            variant: 'destructive'
        });
        if (!confirmed) return;
        const nextServers = { ...servers };
        delete nextServers[id];
        updateMcp({ enabled: mcpConfig.enabled ?? false, servers: nextServers });
    };

    const testServer = async (id: string) => {
        setTestRunning(prev => ({ ...prev, [id]: true }));
        try {
            const res = await axios.post(`/api/mcp/servers/${id}/test`);
            if (res.data.ok) {
                toast.success(t('mcpPage.toasts.testOk', { id }), { description: t('mcpPage.toasts.testOkTools', { tools: (res.data.tools || []).join(', ') }) });
            } else {
                toast.error(t('mcpPage.toasts.testFailedTitle', { id }), { description: res.data.error || t('mcpPage.toasts.testFailedUnknown') });
            }
        } catch (err: any) {
            toast.error(t('mcpPage.toasts.testFailedOverall'), { description: err.response?.data?.detail || err.message });
        } finally {
            setTestRunning(prev => ({ ...prev, [id]: false }));
            await fetchStatus();
        }
    };

    const serverEntries = useMemo(() => Object.entries(servers || {}), [servers]);

    if (loading) return <div className="p-8 text-center text-muted-foreground">{t('mcpPage.loading')}</div>;
    if (yamlError) {
        return (
            <div className="space-y-4 p-6">
                <YamlErrorBanner error={yamlError} />
                <div className="flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-400">
                    <div className="flex items-center">
                        <AlertCircle className="mr-2 h-5 w-5" />
                        {t('mcpPage.yamlErrorDesc')}
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="flex items-center text-xs px-3 py-1.5 rounded transition-colors bg-red-500 text-white hover:bg-red-600 font-medium"
                    >
                        {t('mcpPage.reload')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('mcpPage.title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {t('mcpPage.description')}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchStatus}
                        disabled={statusLoading}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${statusLoading ? 'animate-spin' : ''}`} />
                        {t('mcpPage.refreshStatus')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {saving ? t('mcpPage.saving') : (reloadingEngine ? t('mcpPage.reloading') : t('mcpPage.saveReload'))}
                    </button>
                </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-500 p-4 rounded-md flex items-center justify-between">
                <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {t('mcpPage.alertReload')}
                </div>
            </div>

            <ConfigSection title={t('mcpPage.globalSettingsTitle')} description={t('mcpPage.globalSettingsDesc')}>
                <ConfigCard>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">{t('mcpPage.enableMcp')}</p>
                            <p className="text-sm text-muted-foreground">{t('mcpPage.enableMcpDesc')}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={!!mcpConfig.enabled}
                                onChange={(e) => updateMcp({ enabled: e.target.checked })}
                            />
                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>
                </ConfigCard>
            </ConfigSection>

            <ConfigSection
                title={t('mcpPage.configuredServersTitle')}
                description={t('mcpPage.configuredServersDesc')}
            >
                <div className="flex justify-end">
                    <button
                        onClick={openAddServer}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('mcpPage.addServer')}
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4 mt-4">
                    {serverEntries.map(([id, s]) => {
                        const st = status?.servers?.[id];
                        const up = st?.up;
                        const discoveredCount = (st?.discovered_tools || []).length;
                        const registeredCount = (st?.registered_tools || []).length;
                        const cmd = Array.isArray(s.command) ? s.command.join(' ') : '';
                        return (
                            <ConfigCard key={id} className="group">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2.5 h-2.5 rounded-full ${up ? 'bg-green-500' : 'bg-gray-400'}`} />
                                            <h3 className="font-semibold text-lg">{id}</h3>
                                            {s.enabled === false && (
                                                <span className="text-xs px-2 py-0.5 rounded border text-muted-foreground">{t('mcpPage.disabled')}</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1 break-all">
                                            {t('mcpPage.commandPrefix')} <span className="font-mono text-xs">{cmd || t('mcpPage.notSet')}</span>
                                        </p>
                                        <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                                            <span>{t('mcpPage.discovered')}: {discoveredCount}</span>
                                            <span>{t('mcpPage.registered')}: {registeredCount}</span>
                                            {st?.last_error && <span className="text-destructive">{t('mcpPage.error')}: {String(st.last_error)}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => testServer(id)}
                                            disabled={!!testRunning[id]}
                                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3 py-2"
                                            title={t('mcpPage.testTooltip')}
                                        >
                                            <Play className="w-4 h-4 mr-2" />
                                            {testRunning[id] ? t('mcpPage.testingBtn') : t('mcpPage.testBtn')}
                                        </button>
                                        <button
                                            onClick={() => openEditServer(id)}
                                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3 py-2"
                                        >
                                            <Settings2 className="w-4 h-4 mr-2" />
                                            {t('mcpPage.editBtn')}
                                        </button>
                                        <button
                                            onClick={() => deleteServer(id)}
                                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-destructive/10 hover:text-destructive h-9 px-3 py-2"
                                            title={t('mcpPage.deleteTooltip')}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </ConfigCard>
                        );
                    })}
                    {serverEntries.length === 0 && (
                        <div className="p-8 border border-dashed rounded-lg text-center text-muted-foreground">
                            {t('mcpPage.noServers')}
                        </div>
                    )}
                </div>
            </ConfigSection>

            <Modal
                isOpen={editing}
                onClose={() => { setEditing(false); setServerForm(null); }}
                title={serverForm?.id ? t('mcpPage.modal.editTitle', { id: serverForm.id }) : t('mcpPage.modal.addTitle')}
                size="lg"
                footer={
                    <>
                        <button
                            onClick={() => { setEditing(false); setServerForm(null); }}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                        >
                            {t('mcpPage.modal.cancel')}
                        </button>
                        <button
                            onClick={saveServerForm}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                        >
                            {t('mcpPage.modal.save')}
                        </button>
                    </>
                }
            >
                {serverForm && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium">{t('mcpPage.modal.enabled')}</p>
                                <p className="text-sm text-muted-foreground">{t('mcpPage.modal.enabledDesc')}</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={!!serverForm.enabled}
                                    onChange={(e) => setServerForm({ ...serverForm, enabled: e.target.checked })}
                                />
                                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </div>

                        <FormInput
                            label={t('mcpPage.modal.serverId')}
                            value={serverForm.id}
                            onChange={(e) => setServerForm({ ...serverForm, id: e.target.value })}
                            placeholder={t('mcpPage.modal.serverIdPlaceholder')}
                            tooltip={t('mcpPage.modal.serverIdTooltip')}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('mcpPage.modal.commandExec')}
                                value={serverForm.commandExec}
                                onChange={(e) => setServerForm({ ...serverForm, commandExec: e.target.value })}
                                placeholder={t('mcpPage.modal.commandExecPlaceholder')}
                                tooltip={t('mcpPage.modal.commandExecTooltip')}
                            />
                            <FormInput
                                label={t('mcpPage.modal.commandArgs')}
                                value={serverForm.commandArgs}
                                onChange={(e) => setServerForm({ ...serverForm, commandArgs: e.target.value })}
                                placeholder={t('mcpPage.modal.commandArgsPlaceholder')}
                                tooltip={t('mcpPage.modal.commandArgsTooltip')}
                            />
                        </div>

                        <FormInput
                            label={t('mcpPage.modal.cwd')}
                            value={serverForm.cwd || ''}
                            onChange={(e) => setServerForm({ ...serverForm, cwd: e.target.value })}
                            placeholder={t('mcpPage.modal.cwdPlaceholder')}
                        />

                        <div className="space-y-3">
                            <FormLabel tooltip={t('mcpPage.modal.defaultsTooltip')}>
                                {t('mcpPage.modal.defaults')}
                            </FormLabel>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormInput
                                    label={t('mcpPage.modal.timeoutMs')}
                                    value={String(serverForm.defaults.timeout_ms)}
                                    onChange={(e) => setServerForm({ ...serverForm, defaults: { ...serverForm.defaults, timeout_ms: Number(e.target.value || 0) } })}
                                    placeholder="10000"
                                />
                                <FormInput
                                    label={t('mcpPage.modal.slowThresholdMs')}
                                    value={String(serverForm.defaults.slow_response_threshold_ms)}
                                    onChange={(e) => setServerForm({ ...serverForm, defaults: { ...serverForm.defaults, slow_response_threshold_ms: Number(e.target.value || 0) } })}
                                    placeholder="0"
                                />
                                <FormInput
                                    label={t('mcpPage.modal.slowMessage')}
                                    value={serverForm.defaults.slow_response_message}
                                    onChange={(e) => setServerForm({ ...serverForm, defaults: { ...serverForm.defaults, slow_response_message: e.target.value } })}
                                    placeholder="Let me look that up for you, one moment..."
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <FormLabel tooltip={t('mcpPage.modal.restartPolicyTooltip')}>
                                {t('mcpPage.modal.restartPolicy')}
                            </FormLabel>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="flex items-center justify-between p-3 rounded-md border border-border bg-card/50">
                                    <div>
                                        <p className="text-sm font-medium">{t('mcpPage.modal.restartEnabled')}</p>
                                        <p className="text-xs text-muted-foreground">{t('mcpPage.modal.restartEnabledDesc')}</p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={!!serverForm.restart.enabled}
                                        onChange={(e) => setServerForm({ ...serverForm, restart: { ...serverForm.restart, enabled: e.target.checked } })}
                                    />
                                </div>
                                <FormInput
                                    label={t('mcpPage.modal.maxRestarts')}
                                    value={String(serverForm.restart.max_restarts)}
                                    onChange={(e) => setServerForm({ ...serverForm, restart: { ...serverForm.restart, max_restarts: Number(e.target.value || 0) } })}
                                    placeholder="5"
                                />
                                <FormInput
                                    label={t('mcpPage.modal.backoffMs')}
                                    value={String(serverForm.restart.backoff_ms)}
                                    onChange={(e) => setServerForm({ ...serverForm, restart: { ...serverForm.restart, backoff_ms: Number(e.target.value || 0) } })}
                                    placeholder="1000"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <FormLabel tooltip={t('mcpPage.modal.envTooltip')}>
                                {t('mcpPage.modal.env')}
                            </FormLabel>
                            <div className="space-y-2">
                                {serverForm.env.map((row, idx) => (
                                    <div key={idx} className="grid grid-cols-5 gap-2 items-center">
                                        <input
                                            className="col-span-2 p-2 rounded-md border border-input bg-transparent text-sm"
                                            placeholder="KEY"
                                            value={row.key}
                                            onChange={(e) => {
                                                const next = [...serverForm.env];
                                                next[idx] = { ...row, key: e.target.value };
                                                setServerForm({ ...serverForm, env: next });
                                            }}
                                        />
                                        <input
                                            className="col-span-2 p-2 rounded-md border border-input bg-transparent text-sm"
                                            placeholder={row.redacted ? "<redacted>" : "${ENV_VAR}"}
                                            value={row.value}
                                            onChange={(e) => {
                                                const next = [...serverForm.env];
                                                next[idx] = { ...row, value: e.target.value, redacted: false };
                                                setServerForm({ ...serverForm, env: next });
                                            }}
                                        />
                                        <button
                                            className="p-2 rounded-md border border-input hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => {
                                                const next = serverForm.env.filter((_, i) => i !== idx);
                                                setServerForm({ ...serverForm, env: next });
                                            }}
                                            title="Remove"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-foreground h-9 px-4 py-2"
                                    onClick={() => setServerForm({ ...serverForm, env: [...serverForm.env, { key: '', value: '' }] })}
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    {t('mcpPage.modal.addEnvVar')}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <FormLabel tooltip={t('mcpPage.modal.toolOverridesTooltip')}>
                                {t('mcpPage.modal.toolOverrides')}
                            </FormLabel>
                            <div className="space-y-2">
                                {serverForm.tools.map((tLoc, idx) => (
                                    <div key={idx} className="p-3 rounded-md border border-border bg-card/50 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium">{t('mcpPage.modal.toolNum', { num: idx + 1 })}</p>
                                            <button
                                                className="p-2 rounded-md border border-input hover:bg-destructive/10 hover:text-destructive"
                                                onClick={() => {
                                                    const next = serverForm.tools.filter((_, i) => i !== idx);
                                                    setServerForm({ ...serverForm, tools: next });
                                                }}
                                                title={t('mcpPage.modal.removeToolTooltip')}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormInput
                                                label={t('mcpPage.modal.toolName')}
                                                value={tLoc.name || ''}
                                                onChange={(e) => {
                                                    const next = [...serverForm.tools];
                                                    next[idx] = { ...tLoc, name: e.target.value };
                                                    setServerForm({ ...serverForm, tools: next });
                                                }}
                                                placeholder="get_weather_by_city"
                                            />
                                            <FormInput
                                                label={t('mcpPage.modal.exposeAs')}
                                                value={tLoc.expose_as || ''}
                                                onChange={(e) => {
                                                    const next = [...serverForm.tools];
                                                    next[idx] = { ...tLoc, expose_as: e.target.value };
                                                    setServerForm({ ...serverForm, tools: next });
                                                }}
                                                placeholder="mcp_weather_get_city"
                                                tooltip={t('mcpPage.modal.exposeAsTooltip')}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormInput
                                                label={t('mcpPage.modal.speechField')}
                                                value={tLoc.speech_field || ''}
                                                onChange={(e) => {
                                                    const next = [...serverForm.tools];
                                                    next[idx] = { ...tLoc, speech_field: e.target.value };
                                                    setServerForm({ ...serverForm, tools: next });
                                                }}
                                                placeholder="atis_text"
                                            />
                                            <FormInput
                                                label={t('mcpPage.modal.speechTemplate')}
                                                value={tLoc.speech_template || ''}
                                                onChange={(e) => {
                                                    const next = [...serverForm.tools];
                                                    next[idx] = { ...tLoc, speech_template: e.target.value };
                                                    setServerForm({ ...serverForm, tools: next });
                                                }}
                                                placeholder="The ATIS for {icao} is {atis_text}"
                                            />
                                        </div>
                                    </div>
                                ))}
                                <button
                                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-foreground h-9 px-4 py-2"
                                    onClick={() => setServerForm({ ...serverForm, tools: [...serverForm.tools, { name: '' }] })}
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    {t('mcpPage.modal.addToolOverride')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default MCPPage;
