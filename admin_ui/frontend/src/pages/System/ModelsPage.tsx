import { useState, useEffect } from 'react';
import { HardDrive, Download, Trash2, RefreshCw, CheckCircle2, XCircle, Loader2, Mic, Volume2, Brain, AlertTriangle, Cpu, Terminal, Settings, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConfigCard } from '../../components/ui/ConfigCard';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

interface ModelInfo {
    id: string;
    name: string;
    language?: string;
    region?: string;
    backend?: string;
    size_mb: number;
    size_display: string;
    model_path?: string;
    download_url?: string;
    config_url?: string;  // For TTS models that need JSON config
    voice_files?: Record<string, string>;  // For Kokoro TTS voice files
    installed?: boolean;
    quality?: string;
    gender?: string;
    auto_download?: boolean;  // Models that auto-download from HuggingFace on first use
    note?: string;  // Info note about the model
}

interface InstalledModel {
    name: string;
    path: string;
    size_mb: number;
    type: 'stt' | 'tts' | 'llm';
}

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'warning';
}

interface DownloadProgress {
    bytes_downloaded: number;
    total_bytes: number;
    percent: number;
    speed_bps: number;
    eta_seconds: number | null;
    current_file: string;
}

interface ActiveModels {
    stt: { backend: string; path: string; loaded: boolean };
    tts: { backend: string; path: string; loaded: boolean };
    llm: { path: string; loaded: boolean };
}

interface AvailableModels {
    stt: Record<string, { name: string; path: string }[]>;
    tts: Record<string, { name: string; path: string }[]>;
    llm: { name: string; path: string }[];
}

interface BackendCapabilities {
    stt?: {
        faster_whisper?: { available: boolean; reason?: string };
    };
    tts?: {
        melotts?: { available: boolean; reason?: string };
    };
}

interface CompatibilityIssue {
    key: string;
    message: string;
    requiresRebuild: boolean;
}

interface RuntimeGpuStatus {
    host_preflight_detected?: boolean | null;
    host_preflight_raw?: string | null;
    runtime_detected?: boolean;
    runtime_usable?: boolean;
    source?: string;
    name?: string | null;
    memory_gb?: number | null;
    error?: string | null;
    checked_at_epoch_ms?: number | null;
}

const ModelsPage = () => {
    const { t } = useTranslation();
    const { confirm } = useConfirmDialog();
    const [catalog, setCatalog] = useState<{ stt: ModelInfo[]; tts: ModelInfo[]; llm: ModelInfo[] }>({ stt: [], tts: [], llm: [] });
    const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
    const [languageNames, setLanguageNames] = useState<Record<string, string>>({});
    const [regionNames, setRegionNames] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
    const [deletingModel, setDeletingModel] = useState<string | null>(null);
    const [selectedTab, setSelectedTab] = useState<'installed' | 'stt' | 'tts' | 'llm'>('installed');
    const [selectedRegion, setSelectedRegion] = useState<string>('all');
    const [toasts, setToasts] = useState<Toast[]>([]);

    // Active models state (from Local AI Server)
    const [activeModels, setActiveModels] = useState<ActiveModels | null>(null);
    const [availableModels, setAvailableModels] = useState<AvailableModels | null>(null);
    const [serverStatus, setServerStatus] = useState<'connected' | 'error' | 'loading'>('loading');
    const [restarting, setRestarting] = useState(false);
    const [pendingChanges, setPendingChanges] = useState<{ stt?: string; tts?: string; llm?: string }>({});
    const [startingServer, setStartingServer] = useState(false);
    const [capabilities, setCapabilities] = useState<BackendCapabilities | null>(null);
    const [envConfig, setEnvConfig] = useState<Record<string, string>>({});
    const [forceIncompatibleApply, setForceIncompatibleApply] = useState(false);
    const [runtimeGpu, setRuntimeGpu] = useState<RuntimeGpuStatus | null>(null);


    const showToast = (message: string, type: 'success' | 'error' | 'warning') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    };

    const fetchModels = async () => {
        setLoading(true);
        try {
            // Fetch catalog
            const catalogRes = await axios.get('/api/wizard/local/available-models');
            if (catalogRes.data) {
                setCatalog(catalogRes.data.catalog);
                setLanguageNames(catalogRes.data.language_names || {});
                setRegionNames(catalogRes.data.region_names || {});
            }

            // Fetch installed models from local-ai-server
            const installedRes = await axios.get('/api/local-ai/models');
            if (installedRes.data) {
                // Flatten the nested response into a single array
                const models: InstalledModel[] = [];

                // Process STT models (grouped by backend)
                if (installedRes.data.stt) {
                    Object.entries(installedRes.data.stt).forEach(([_backend, backendModels]: [string, any]) => {
                        if (Array.isArray(backendModels)) {
                            backendModels.forEach((m: any) => {
                                models.push({
                                    name: m.name,
                                    path: m.path,
                                    size_mb: m.size_mb || 0,
                                    type: 'stt'
                                });
                            });
                        }
                    });
                }

                // Process TTS models (grouped by backend)
                if (installedRes.data.tts) {
                    Object.entries(installedRes.data.tts).forEach(([_backend, backendModels]: [string, any]) => {
                        if (Array.isArray(backendModels)) {
                            backendModels.forEach((m: any) => {
                                models.push({
                                    name: m.name,
                                    path: m.path,
                                    size_mb: m.size_mb || 0,
                                    type: 'tts'
                                });
                            });
                        }
                    });
                }

                // Process LLM models (flat array)
                if (Array.isArray(installedRes.data.llm)) {
                    installedRes.data.llm.forEach((m: any) => {
                        models.push({
                            name: m.name,
                            path: m.path,
                            size_mb: m.size_mb || 0,
                            type: 'llm'
                        });
                    });
                }

                setInstalledModels(models);
            }
        } catch (err) {
            console.error('Failed to fetch models', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchModels();
        fetchActiveModels();
    }, []);

    // Fetch active models from Local AI Server health
    const fetchActiveModels = async () => {
        const [healthRes, modelsRes, capabilitiesRes, envRes] = await Promise.allSettled([
            axios.get('/api/system/health'),
            axios.get('/api/local-ai/models'),
            axios.get('/api/local-ai/capabilities'),
            axios.get('/api/config/env')
        ]);

        if (healthRes.status === 'fulfilled') {
            const localAI = healthRes.value.data?.local_ai_server;
            if (localAI?.status === 'connected') {
                setServerStatus('connected');
                setRuntimeGpu((localAI.details?.gpu || null) as RuntimeGpuStatus | null);
                setActiveModels({
                    stt: {
                        backend: localAI.details?.models?.stt?.backend || 'unknown',
                        path: localAI.details?.models?.stt?.path || '',
                        loaded: localAI.details?.models?.stt?.loaded || false
                    },
                    tts: {
                        backend: localAI.details?.models?.tts?.backend || 'unknown',
                        path: localAI.details?.models?.tts?.path || '',
                        loaded: localAI.details?.models?.tts?.loaded || false
                    },
                    llm: {
                        path: localAI.details?.models?.llm?.path || '',
                        loaded: localAI.details?.models?.llm?.loaded || false
                    }
                });
            } else {
                setServerStatus('error');
                setRuntimeGpu(null);
            }
        } else {
            setServerStatus('error');
            setRuntimeGpu(null);
        }

        if (modelsRes.status === 'fulfilled' && modelsRes.value.data) {
            setAvailableModels(modelsRes.value.data);
        }
        if (capabilitiesRes.status === 'fulfilled' && capabilitiesRes.value.data) {
            setCapabilities(capabilitiesRes.value.data);
        }
        if (envRes.status === 'fulfilled' && envRes.value.data) {
            setEnvConfig(envRes.value.data || {});
        }
    };

    // Handle model switch
    const handleModelSwitch = async (
        modelType: 'stt' | 'tts' | 'llm',
        backend: string,
        modelPath: string,
        forceIncompatibleApplyRequest = false
    ) => {
        return axios.post('/api/local-ai/switch', {
            model_type: modelType,
            backend: backend,
            model_path: modelPath,
            force_incompatible_apply: forceIncompatibleApplyRequest
        });
    };

    // Get model name from path
    const getModelName = (path: string) => {
        if (!path) return 'None';
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
    };

    const handleDownload = async (model: ModelInfo, type: 'stt' | 'tts' | 'llm') => {
        if (!model.download_url) {
            showToast('This model requires an API key and cannot be downloaded', 'error');
            return;
        }

        setDownloadingModel(model.id);
        setDownloadProgress(null);
        try {
            const startRes = await axios.post('/api/wizard/local/download-model', {
                model_id: model.id,
                type: type,
                download_url: model.download_url,
                model_path: model.model_path,
                config_url: model.config_url,  // For TTS models (Piper JSON config)
                voice_files: model.voice_files  // For Kokoro TTS voice files
            });
            const jobId = startRes.data?.job_id;
            const diskWarning = startRes.data?.disk_warning;
            if (diskWarning) showToast(diskWarning, 'warning');
            showToast(t('models.messages.startedDownload', { name: model.name }), 'success');
            // Poll for completion with progress updates
            const pollDownload = async () => {
                try {
                    const res = await axios.get('/api/wizard/local/download-progress', {
                        params: jobId ? { job_id: jobId } : undefined
                    });
                    // Update progress state - always set if running to show progress bar
                    if (res.data.running) {
                        setDownloadProgress({
                            bytes_downloaded: res.data.bytes_downloaded || 0,
                            total_bytes: res.data.total_bytes || 0,
                            percent: res.data.percent || 0,
                            speed_bps: res.data.speed_bps || 0,
                            eta_seconds: res.data.eta_seconds,
                            current_file: res.data.current_file || ''
                        });
                    }

                    if (res.data.completed) {
                        showToast(t('models.messages.downloadSuccess', { name: model.name }), 'success');
                        setDownloadingModel(null);
                        setDownloadProgress(null);
                        fetchModels();
                    } else if (res.data.error) {
                        showToast(t('models.messages.downloadFailed', { error: res.data.error }), 'error');
                        setDownloadingModel(null);
                        setDownloadProgress(null);
                    } else if (res.data.running) {
                        setTimeout(pollDownload, 1000);
                    } else {
                        setDownloadingModel(null);
                        setDownloadProgress(null);
                    }
                } catch (err) {
                    setTimeout(pollDownload, 2000);
                }
            };
            setTimeout(pollDownload, 500);
        } catch (err: any) {
            const message = err.response?.data?.detail || err.response?.data?.message || err.message || 'Unknown error';
            showToast(t('models.messages.startDownloadFailed', { error: message }), 'error');
            setDownloadingModel(null);
            setDownloadProgress(null);
        }
    };

    const handleDelete = async (model: InstalledModel) => {
        const confirmed = await confirm({
            title: t('models.catalog.deleteConfirmTitle'),
            description: t('models.catalog.deleteConfirmDesc', { name: model.name }),
            confirmText: t('models.catalog.delete'),
            variant: 'destructive'
        });
        if (!confirmed) return;

        setDeletingModel(model.name);
        try {
            await axios.delete('/api/local-ai/models', {
                data: { model_path: model.path, type: model.type }
            });
            showToast(t('models.messages.deletedSuccess', { name: model.name }), 'success');
            fetchModels();
        } catch (err: any) {
            const message = err.response?.data?.detail || err.message || 'Unknown error';
            showToast(t('models.messages.deleteFailed', { error: message }), 'error');
        } finally {
            setDeletingModel(null);
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'stt': return <Mic className="w-4 h-4" />;
            case 'tts': return <Volume2 className="w-4 h-4" />;
            case 'llm': return <Brain className="w-4 h-4" />;
            default: return <HardDrive className="w-4 h-4" />;
        }
    };

    const filterByRegion = (models: ModelInfo[]) => {
        if (selectedRegion === 'all') return models;
        return models.filter(m => m.region === selectedRegion);
    };

    const getUniqueRegions = () => {
        const regions = new Set<string>();
        [...catalog.stt, ...catalog.tts].forEach(m => {
            if (m.region) regions.add(m.region);
        });
        return Array.from(regions);
    };

    const isModelInstalled = (modelPath: string) => {
        return installedModels.some(m => m.path.includes(modelPath) || m.name === modelPath);
    };

    // Get friendly display name for installed model by matching against catalog
    const getModelDisplayName = (model: InstalledModel): string => {
        const allCatalogModels = [...catalog.stt, ...catalog.tts, ...catalog.llm];
        const catalogMatch = allCatalogModels.find(cm =>
            cm.model_path && (model.path.includes(cm.model_path) || model.name === cm.model_path)
        );
        return catalogMatch?.name || model.name;
    };

    const isTruthy = (value: string | undefined | null): boolean => {
        const raw = (value || '').trim().toLowerCase();
        return ['1', 'true', 'yes', 'on'].includes(raw);
    };

    const parseSelection = (value: string | undefined): { backend: string; modelPath: string } => {
        if (!value) return { backend: '', modelPath: '' };
        const [backend, ...pathParts] = value.split(':');
        return { backend, modelPath: pathParts.join(':') };
    };

    const gpuDetected = isTruthy(envConfig.GPU_AVAILABLE);
    const fasterWhisperDevice = (envConfig.FASTER_WHISPER_DEVICE || 'cpu').trim().toLowerCase();
    const melottsDevice = (envConfig.MELOTTS_DEVICE || 'cpu').trim().toLowerCase();
    const gpuStatusKnown = typeof envConfig.GPU_AVAILABLE !== 'undefined';
    const runtimeGpuKnown = runtimeGpu !== null && typeof runtimeGpu.runtime_detected === 'boolean';
    const runtimeGpuDetected = runtimeGpu?.runtime_detected === true;
    const runtimeGpuUsable = runtimeGpu?.runtime_usable === true;

    const getCompatibilityIssues = (changes: { stt?: string; tts?: string; llm?: string }): CompatibilityIssue[] => {
        const issues: CompatibilityIssue[] = [];
        const sttSel = parseSelection(changes.stt);
        const ttsSel = parseSelection(changes.tts);

        if (sttSel.backend === 'faster_whisper' && capabilities && !capabilities.stt?.faster_whisper?.available) {
            issues.push({
                key: 'fw_rebuild',
                message: 'Faster-Whisper is not installed in this Local AI image. Full container rebuild is required.',
                requiresRebuild: true
            });
        }
        if (ttsSel.backend === 'melotts' && capabilities && !capabilities.tts?.melotts?.available) {
            issues.push({
                key: 'melotts_rebuild',
                message: 'MeloTTS is not installed in this Local AI image. Full container rebuild is required.',
                requiresRebuild: true
            });
        }
        if (!gpuDetected && sttSel.backend === 'faster_whisper' && fasterWhisperDevice === 'cuda') {
            issues.push({
                key: 'fw_cuda_without_gpu',
                message: 'FASTER_WHISPER_DEVICE is set to CUDA but preflight reports no GPU. Use CPU in Env page unless forcing this config.',
                requiresRebuild: false
            });
        }
        if (!gpuDetected && ttsSel.backend === 'melotts' && melottsDevice === 'cuda') {
            issues.push({
                key: 'melotts_cuda_without_gpu',
                message: 'MELOTTS_DEVICE is set to CUDA but preflight reports no GPU. Use CPU in Env page unless forcing this config.',
                requiresRebuild: false
            });
        }
        if (runtimeGpuKnown && !runtimeGpuUsable && sttSel.backend === 'faster_whisper' && fasterWhisperDevice === 'cuda') {
            issues.push({
                key: 'fw_cuda_runtime_unavailable',
                message: `Runtime GPU is unavailable in local_ai_server${runtimeGpu?.error ? ` (${runtimeGpu.error})` : ''}. Faster-Whisper on CUDA is likely to fail.`,
                requiresRebuild: false
            });
        }
        if (runtimeGpuKnown && !runtimeGpuUsable && ttsSel.backend === 'melotts' && melottsDevice === 'cuda') {
            issues.push({
                key: 'melotts_cuda_runtime_unavailable',
                message: `Runtime GPU is unavailable in local_ai_server${runtimeGpu?.error ? ` (${runtimeGpu.error})` : ''}. MeloTTS on CUDA is likely to fail.`,
                requiresRebuild: false
            });
        }

        return issues;
    };

    const compatibilityIssues = getCompatibilityIssues(pendingChanges);
    const requiresRebuild = {
        fasterWhisper: compatibilityIssues.some(issue => issue.key === 'fw_rebuild'),
        meloTts: compatibilityIssues.some(issue => issue.key === 'melotts_rebuild')
    };
    const requiresAnyRebuild = requiresRebuild.fasterWhisper || requiresRebuild.meloTts;

    const applyPendingChanges = async () => {
        if (Object.keys(pendingChanges).length === 0) return;
        if (compatibilityIssues.length > 0 && !forceIncompatibleApply) {
            showToast(t('models.compatibility.resolveWarnings'), 'warning');
            return;
        }

        setRestarting(true);
        try {
            const remainingChanges = { ...pendingChanges };

            if (requiresAnyRebuild && forceIncompatibleApply) {
                const sttSel = parseSelection(remainingChanges.stt);
                const ttsSel = parseSelection(remainingChanges.tts);

                const rebuildRes = await axios.post('/api/local-ai/rebuild', {
                    include_faster_whisper: requiresRebuild.fasterWhisper,
                    include_melotts: requiresRebuild.meloTts,
                    stt_backend: sttSel.backend || undefined,
                    stt_model: sttSel.modelPath || undefined,
                    tts_backend: ttsSel.backend || undefined,
                    tts_voice: ttsSel.modelPath || undefined
                });

                if (!rebuildRes.data?.success) {
                    throw new Error(rebuildRes.data?.message || 'Local AI rebuild failed.');
                }
                showToast(rebuildRes.data?.message || 'Local AI rebuild completed.', 'success');

                if (requiresRebuild.fasterWhisper) delete remainingChanges.stt;
                if (requiresRebuild.meloTts) delete remainingChanges.tts;
            }

            for (const [type, value] of Object.entries(remainingChanges)) {
                if (!value) continue;
                if (type === 'llm') {
                    await handleModelSwitch('llm', '', value, forceIncompatibleApply);
                } else {
                    const [backend, ...pathParts] = value.split(':');
                    await handleModelSwitch(type as 'stt' | 'tts', backend, pathParts.join(':'), forceIncompatibleApply);
                }
            }

            showToast(requiresAnyRebuild ? t('models.messages.rebuildSuccess') : t('models.messages.applySuccess'), 'success');
            setPendingChanges({});
            setForceIncompatibleApply(false);
            setTimeout(() => {
                fetchActiveModels();
                setRestarting(false);
            }, 15000);
        } catch (err: any) {
            const message = err.response?.data?.detail || err.response?.data?.message || err.message;
            showToast(t('models.messages.applyFailed', { error: message }), 'error');
            setRestarting(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            {/* Toast notifications */}
            <div className="fixed top-4 right-4 z-50 space-y-2">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${toast.type === 'success'
                            ? 'bg-green-600 text-white'
                            : toast.type === 'warning'
                                ? 'bg-yellow-600 text-white'
                                : 'bg-red-600 text-white'
                            }`}
                    >
                        {toast.type === 'success' ? (
                            <CheckCircle2 className="w-4 h-4" />
                        ) : toast.type === 'warning' ? (
                            <AlertTriangle className="w-4 h-4" />
                        ) : (
                            <XCircle className="w-4 h-4" />
                        )}
                        {toast.message}
                    </div>
                ))}
            </div>

            {/* Local AI Server Section - Compact Header */}
            <div className="rounded-lg border border-border bg-card">
                <div className="flex justify-between items-center px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-3">
                        <Cpu className="w-5 h-5 text-blue-500" />
                        <h3 className="font-semibold">{t('models.server.title')}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${serverStatus === 'connected' ? 'bg-green-500/10 text-green-500' :
                            serverStatus === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'
                            }`}>
                            {serverStatus === 'connected' ? (
                                <><CheckCircle2 className="w-3 h-3" /> {t('models.server.connected')}</>
                            ) : serverStatus === 'error' ? (
                                <><XCircle className="w-3 h-3" /> {t('models.server.error')}</>
                            ) : (
                                t('models.server.loading')
                            )}
                        </span>
                        <div className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground">{t('models.server.gpuDetected')}</span>
                            <span
                                className={`px-2 py-0.5 rounded-full font-medium ${gpuStatusKnown
                                    ? (gpuDetected ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500')
                                    : 'bg-muted text-muted-foreground'
                                    }`}
                                title={`Host/preflight signal from .env GPU_AVAILABLE=${envConfig.GPU_AVAILABLE ?? 'unset'}`}
                            >
                                {t('models.server.host')}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span
                                className={`px-2 py-0.5 rounded-full font-medium ${runtimeGpuKnown
                                    ? (runtimeGpuDetected ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500')
                                    : 'bg-muted text-muted-foreground'
                                    }`}
                                title={runtimeGpu?.error || 'Runtime probe from local_ai_server status'}
                            >
                                {t('models.server.runtime')}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-1">
                        <Link
                            to="/env"
                            className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors"
                            title={t('common.configure')}
                        >
                            <Settings className="w-4 h-4" />
                        </Link>
                        <button
                            onClick={async () => {
                                const confirmed = await confirm({
                                    title: t('models.server.restartConfirmTitle'),
                                    description: t('models.server.restartConfirmDesc'),
                                    confirmText: t('common.restart'),
                                    variant: 'destructive'
                                });
                                if (!confirmed) return;
                                setRestarting(true);
                                axios.post('/api/system/containers/local_ai_server/restart')
                                    .then(() => setTimeout(() => { fetchActiveModels(); setRestarting(false); }, 5000))
                                    .catch(() => setRestarting(false));
                            }}
                            disabled={restarting}
                            className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors"
                            title={t('common.restart')}
                        >
                            <RefreshCw className={`w-4 h-4 ${restarting ? 'animate-spin' : ''}`} />
                        </button>
                        <Link
                            to="/logs?container=local_ai_server"
                            className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors"
                            title={t('common.viewLogs')}
                        >
                            <Terminal className="w-4 h-4" />
                        </Link>
                    </div>
                </div>

                {serverStatus === 'connected' && activeModels && (
                    <div className="p-4 space-y-4">
                        <div className="text-xs text-muted-foreground">
                            {runtimeGpuKnown ? (
                                <span>
                                    {t('models.server.runtimeProbe')} {runtimeGpuUsable ? t('models.server.gpuUsable') : t('models.server.gpuNotUsable')}
                                    {runtimeGpu?.source ? ` ${t('models.server.via', { source: runtimeGpu.source })}` : ''}
                                    {runtimeGpu?.name ? ` (${runtimeGpu.name}${runtimeGpu.memory_gb ? `, ${runtimeGpu.memory_gb} GB` : ''})` : ''}
                                    {runtimeGpu?.error ? ` • ${runtimeGpu.error}` : ''}
                                </span>
                            ) : (
                                <span>{t('models.server.runtimeProbe')} {t('common.notAvailable')}</span>
                            )}
                        </div>
                        {!gpuDetected && (fasterWhisperDevice === 'cuda' || melottsDevice === 'cuda') && (
                            <div className="p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
                                {t('models.server.cudaWarning')}
                            </div>
                        )}
                        {runtimeGpuKnown && !runtimeGpuUsable && (fasterWhisperDevice === 'cuda' || melottsDevice === 'cuda') && (
                            <div className="p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
                                {t('models.server.cudaRuntimeWarning', { error: runtimeGpu?.error ? ` (${runtimeGpu.error})` : '' })}
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* STT Model */}
                            <div className="p-4 rounded-lg border border-border bg-muted/30">
                                <div className="flex items-center gap-2 mb-2">
                                    <Mic className="w-4 h-4 text-blue-500" />
                                    <span className="text-sm font-medium">{t('models.active.stt')}</span>
                                    <span className={`ml-auto px-2 py-0.5 rounded text-xs ${activeModels.stt.loaded ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                                        }`}>
                                        {activeModels.stt.loaded ? t('models.active.loaded') : t('models.active.notLoaded')}
                                    </span>
                                </div>
                                <select
                                    className="w-full text-xs p-2 rounded border border-border bg-background"
                                    value={pendingChanges.stt || `${activeModels.stt.backend}:${activeModels.stt.path}`}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setPendingChanges(prev => ({ ...prev, stt: val }));
                                    }}
                                    disabled={restarting}
                                >
                                    {availableModels?.stt && Object.entries(availableModels.stt).map(([backend, models]) => (
                                        backend === 'faster_whisper' ? null : (
                                            <optgroup key={backend} label={backend.charAt(0).toUpperCase() + backend.slice(1)}>
                                                {models.map((m: any) => (
                                                    <option key={m.path} value={`${backend}:${m.path}`}>{m.name}</option>
                                                ))}
                                            </optgroup>
                                        )
                                    ))}
                                    <optgroup label="Faster Whisper">
                                        <option value="faster_whisper:base">
                                            Whisper Base {!capabilities?.stt?.faster_whisper?.available ? t('models.active.requiresRebuild') : ''}
                                        </option>
                                        <option value="faster_whisper:small">Whisper Small</option>
                                        <option value="faster_whisper:medium">Whisper Medium</option>
                                    </optgroup>
                                </select>
                                <div className="mt-2 text-xs text-muted-foreground truncate" title={activeModels.stt.path}>
                                    {getModelName(activeModels.stt.path)}
                                </div>
                            </div>

                            {/* LLM Model */}
                            <div className="p-4 rounded-lg border border-border bg-muted/30">
                                <div className="flex items-center gap-2 mb-2">
                                    <Brain className="w-4 h-4 text-purple-500" />
                                    <span className="text-sm font-medium">{t('models.active.llm')}</span>
                                    <span className={`ml-auto px-2 py-0.5 rounded text-xs ${activeModels.llm.loaded ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                                        }`}>
                                        {activeModels.llm.loaded ? t('models.active.loaded') : t('models.active.notLoaded')}
                                    </span>
                                </div>
                                <select
                                    className="w-full text-xs p-2 rounded border border-border bg-background"
                                    value={pendingChanges.llm || activeModels.llm.path}
                                    onChange={(e) => {
                                        setPendingChanges(prev => ({ ...prev, llm: e.target.value }));
                                    }}
                                    disabled={restarting}
                                >
                                    {availableModels?.llm?.map((m: any) => (
                                        <option key={m.path} value={m.path}>{m.name}</option>
                                    ))}
                                </select>
                                <div className="mt-2 text-xs text-muted-foreground truncate" title={activeModels.llm.path}>
                                    {getModelName(activeModels.llm.path)}
                                </div>
                            </div>

                            {/* TTS Model */}
                            <div className="p-4 rounded-lg border border-border bg-muted/30">
                                <div className="flex items-center gap-2 mb-2">
                                    <Volume2 className="w-4 h-4 text-green-500" />
                                    <span className="text-sm font-medium">{t('models.active.tts')}</span>
                                    <span className={`ml-auto px-2 py-0.5 rounded text-xs ${activeModels.tts.loaded ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                                        }`}>
                                        {activeModels.tts.loaded ? t('models.active.loaded') : t('models.active.notLoaded')}
                                    </span>
                                </div>
                                <select
                                    className="w-full text-xs p-2 rounded border border-border bg-background"
                                    value={pendingChanges.tts || `${activeModels.tts.backend}:${activeModels.tts.path}`}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setPendingChanges(prev => ({ ...prev, tts: val }));
                                    }}
                                    disabled={restarting}
                                >
                                    {availableModels?.tts && Object.entries(availableModels.tts).map(([backend, models]) => (
                                        backend === 'melotts' ? null : (
                                            <optgroup key={backend} label={backend.charAt(0).toUpperCase() + backend.slice(1)}>
                                                {models.map((m: any) => (
                                                    <option key={m.path} value={`${backend}:${m.path}`}>{m.name}</option>
                                                ))}
                                            </optgroup>
                                        )
                                    ))}
                                    <optgroup label="MeloTTS">
                                        <option value="melotts:EN-US">
                                            MeloTTS US {!capabilities?.tts?.melotts?.available ? t('models.active.requiresRebuild') : ''}
                                        </option>
                                        <option value="melotts:EN-BR">MeloTTS UK</option>
                                        <option value="melotts:EN-AU">MeloTTS AU</option>
                                    </optgroup>
                                </select>
                                <div className="mt-2 text-xs text-muted-foreground truncate" title={activeModels.tts.path}>
                                    {getModelName(activeModels.tts.path)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {serverStatus === 'error' && (
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-3">
                            {t('models.server.unreachable')}
                        </p>
                        <button
                            onClick={() => {
                                setStartingServer(true);
                                axios.post('/api/system/containers/local_ai_server/start')
                                    .then(() => setTimeout(() => { fetchActiveModels(); setStartingServer(false); }, 5000))
                                    .catch(() => setStartingServer(false));
                            }}
                            disabled={startingServer}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                            {startingServer ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    {t('models.server.starting')}
                                </>
                            ) : (
                                <>
                                    <Play className="w-4 h-4" />
                                    {t('models.server.start')}
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Apply Changes Button */}
                {Object.keys(pendingChanges).length > 0 && (
                    <div className="mt-4 space-y-3">
                        {compatibilityIssues.length > 0 && (
                            <div className="p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-sm">
                                <div className="font-medium text-amber-700 dark:text-amber-300 mb-1">
                                    Compatibility checks found warnings
                                </div>
                                <ul className="list-disc pl-5 space-y-1 text-amber-700 dark:text-amber-300">
                                    {compatibilityIssues.map(issue => (
                                        <li key={issue.key}>{issue.message}</li>
                                    ))}
                                </ul>
                                {requiresAnyRebuild && (
                                    <div className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                                        Force apply will trigger a full `local_ai_server` image rebuild and recreate.
                                    </div>
                                )}
                                <label className="mt-2 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                                    <input
                                        type="checkbox"
                                        className="rounded border-amber-500/50"
                                        checked={forceIncompatibleApply}
                                        onChange={(e) => setForceIncompatibleApply(e.target.checked)}
                                        disabled={restarting}
                                    />
                                    Force apply incompatible selections
                                </label>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button
                                onClick={applyPendingChanges}
                                disabled={restarting || (compatibilityIssues.length > 0 && !forceIncompatibleApply)}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                                {restarting ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        Restarting...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4" />
                                        {requiresAnyRebuild && forceIncompatibleApply ? 'Apply (Force + Rebuild)' : 'Apply Changes & Restart'}
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setPendingChanges({});
                                    setForceIncompatibleApply(false);
                                }}
                                disabled={restarting}
                                className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Model Library Section - Full Width */}
            <div className="rounded-lg border border-border bg-card">
                <div className="flex justify-between items-center px-4 py-3 border-b border-border">
                    <div>
                        <h3 className="font-semibold">Model Library</h3>
                        <p className="text-sm text-muted-foreground">Download and manage STT, TTS, and LLM models</p>
                    </div>
                    <button
                        onClick={fetchModels}
                        disabled={loading}
                        className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                {/* Tabs and Region Filter */}
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
                    <button
                        onClick={() => setSelectedTab('installed')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${selectedTab === 'installed'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                            }`}
                    >
                        Installed ({installedModels.length})
                    </button>
                    <button
                        onClick={() => setSelectedTab('stt')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${selectedTab === 'stt'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                            }`}
                    >
                        <Mic className="w-3.5 h-3.5" /> STT ({catalog.stt.length})
                    </button>
                    <button
                        onClick={() => setSelectedTab('tts')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${selectedTab === 'tts'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                            }`}
                    >
                        <Volume2 className="w-3.5 h-3.5" /> TTS ({catalog.tts.length})
                    </button>
                    <button
                        onClick={() => setSelectedTab('llm')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${selectedTab === 'llm'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                            }`}
                    >
                        <Brain className="w-3.5 h-3.5" /> LLM ({catalog.llm.length})
                    </button>
                    {selectedTab !== 'installed' && selectedTab !== 'llm' && (
                        <select
                            value={selectedRegion}
                            onChange={e => setSelectedRegion(e.target.value)}
                            className="ml-auto px-3 py-1.5 rounded-md border border-input bg-background text-sm"
                        >
                            <option value="all">All Regions</option>
                            {getUniqueRegions().map(region => (
                                <option key={region} value={region}>
                                    {regionNames[region] || region}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Content Area */}
                <div className="p-4">
                    {/* Download Progress Bar */}
                    {downloadingModel && downloadProgress && (
                        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                                    {t('models.catalog.downloading')}: {downloadProgress.current_file || downloadingModel}
                                </span>
                                <span className="text-sm text-blue-600 dark:text-blue-400">
                                    {downloadProgress.total_bytes > 0 ? `${downloadProgress.percent}%` : t('models.catalog.downloading')}
                                </span>
                            </div>
                            <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mb-2 overflow-hidden">
                                {downloadProgress.total_bytes > 0 ? (
                                    <div
                                        className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${downloadProgress.percent}%` }}
                                    />
                                ) : (
                                    <div className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full animate-pulse w-full opacity-50" />
                                )}
                            </div>
                            <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400">
                                <span>
                                    {(downloadProgress.bytes_downloaded / (1024 * 1024)).toFixed(1)} MB
                                    {downloadProgress.total_bytes > 0 && ` / ${(downloadProgress.total_bytes / (1024 * 1024)).toFixed(1)} MB`}
                                </span>
                                <span>
                                    {downloadProgress.speed_bps > 0 && `${(downloadProgress.speed_bps / (1024 * 1024)).toFixed(2)} MB/s`}
                                    {downloadProgress.eta_seconds !== null && downloadProgress.eta_seconds > 0 && (
                                        <> • {t('models.catalog.remaining')}: {Math.floor(downloadProgress.eta_seconds / 60)}m {downloadProgress.eta_seconds % 60}s</>
                                    )}
                                </span>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex justify-center items-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {selectedTab === 'installed' ? (
                                installedModels.length > 0 ? (
                                    installedModels.map((model) => (
                                        <ConfigCard
                                            key={model.path}
                                            title={getModelDisplayName(model)}
                                            icon={getTypeIcon(model.type)}
                                        >
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="px-2 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium uppercase">
                                                        {model.type.toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-muted-foreground break-all bg-muted/50 p-2 rounded">
                                                    {model.path}
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-border">
                                                    <span className="text-xs text-muted-foreground">
                                                        {t('models.catalog.size')} {model.size_mb > 0 ? `${(model.size_mb).toFixed(1)} MB` : 'N/A'}
                                                    </span>
                                                    <button
                                                        onClick={() => handleDelete(model)}
                                                        disabled={deletingModel === model.name}
                                                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50"
                                                        title={t('models.catalog.delete')}
                                                    >
                                                        {deletingModel === model.name ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </ConfigCard>
                                    ))
                                ) : (
                                    <div className="col-span-full py-12 text-center text-muted-foreground">
                                        <HardDrive className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>{t('models.catalog.noModels')}</p>
                                        <p className="text-sm mt-2">{t('models.catalog.browseTabs')}</p>
                                    </div>
                                )
                            ) : (
                                filterByRegion(catalog[selectedTab as 'stt' | 'tts'] || catalog.llm).map((model) => (
                                    <ConfigCard
                                        key={model.id}
                                        title={model.name}
                                        icon={getTypeIcon(selectedTab === 'llm' ? 'llm' : selectedTab as 'stt' | 'tts')}
                                    >
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="px-2 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium uppercase">
                                                    {catalog.llm.some(m => m.id === model.id) ? 'GGUF' : model.size_display}
                                                </span>
                                            </div>
                                            <div className="space-y-1">
                                                {model.language && (
                                                    <div className="text-xs flex justify-between">
                                                        <span className="text-muted-foreground">{t('models.catalog.language')}</span>
                                                        <span className="font-medium">{languageNames[model.language] || model.language}</span>
                                                    </div>
                                                )}
                                                {model.region && (
                                                    <div className="text-xs flex justify-between">
                                                        <span className="text-muted-foreground">{t('models.catalog.region')}</span>
                                                        <span className="font-medium">{regionNames[model.region] || model.region}</span>
                                                    </div>
                                                )}
                                                {model.quality && (
                                                    <div className="text-xs flex justify-between">
                                                        <span className="text-muted-foreground">{t('models.catalog.quality')}</span>
                                                        <span className="font-medium">{model.quality}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {model.note && (
                                                <p className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded italic">
                                                    {model.note}
                                                </p>
                                            )}

                                            {downloadingModel === model.id && downloadProgress && (
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-[10px]">
                                                        <span className="truncate max-w-[150px]">{downloadProgress.current_file}</span>
                                                        <span>{downloadProgress.percent}%</span>
                                                    </div>
                                                    <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                                                        <div
                                                            className="bg-primary h-full transition-all duration-300"
                                                            style={{ width: `${downloadProgress.percent}%` }}
                                                        />
                                                    </div>
                                                    {downloadProgress.eta_seconds !== null && (
                                                        <div className="text-[10px] text-right text-muted-foreground">
                                                            {Math.floor(downloadProgress.eta_seconds / 60)}m {downloadProgress.eta_seconds % 60}s {t('models.catalog.remaining')}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="pt-2 border-t border-border">
                                                {isModelInstalled(model.model_path || model.id) ? (
                                                    <div className="flex items-center justify-center gap-2 py-2 text-xs font-medium text-green-500">
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        {t('models.catalog.installed')}
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleDownload(model, selectedTab === 'llm' ? 'llm' : selectedTab as 'stt' | 'tts')}
                                                        disabled={!!downloadingModel || (model.auto_download && !model.download_url)}
                                                        className="w-full flex items-center justify-center gap-2 py-2 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50 text-xs font-medium"
                                                    >
                                                        {model.auto_download && !model.download_url ? (
                                                            <>
                                                                <RefreshCw className="w-4 h-4" />
                                                                {t('models.catalog.autoDownload')}
                                                            </>
                                                        ) : downloadingModel === model.id ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                {t('models.catalog.downloading')}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Download className="w-4 h-4" />
                                                                {t('models.catalog.download')}
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </ConfigCard>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ModelsPage;
