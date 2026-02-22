import axios from 'axios';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { Save, Eye, EyeOff, RefreshCw, AlertTriangle, AlertCircle, CheckCircle, XCircle, Loader2, Cpu, Server, Settings } from 'lucide-react';
import { ConfigSection } from '../../components/ui/ConfigSection';
import { ConfigCard } from '../../components/ui/ConfigCard';
import { FormInput, FormSelect, FormSwitch } from '../../components/ui/FormComponents';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../auth/AuthContext';

type EnvTab = 'ai-engine' | 'local-ai' | 'system';

// SecretInput defined OUTSIDE EnvPage to prevent re-creation on every render
const SecretInput = ({
    label,
    placeholder,
    value,
    onChange,
    showSecret,
    onToggleSecret
}: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    showSecret: boolean;
    onToggleSecret: () => void;
}) => (
    <div className="relative">
        <FormInput
            label={label}
            type={showSecret ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
        />
        <button
            type="button"
            onClick={onToggleSecret}
            className="absolute right-3 top-[38px] text-muted-foreground hover:text-foreground"
        >
            {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
    </div>
);

const EnvPage = () => {
    const { t } = useTranslation();
    const { confirm } = useConfirmDialog();
    const { token, loading: authLoading } = useAuth();
    const [env, setEnv] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
    const [ariTestResult, setAriTestResult] = useState<{ success: boolean; message?: string; error?: string; asterisk_version?: string } | null>(null);
    const [ariTesting, setAriTesting] = useState(false);
    const [pendingRestart, setPendingRestart] = useState(false);
    const [restartingEngine, setRestartingEngine] = useState(false);
    const [applyPlan, setApplyPlan] = useState<Array<{ service: string; method: string; endpoint: string }>>([]);
    const [changedKeys, setChangedKeys] = useState<string[]>([]);
    const [showAdvancedKokoro, setShowAdvancedKokoro] = useState(false);
    const [smtpTestTo, setSmtpTestTo] = useState('');
    const [smtpTesting, setSmtpTesting] = useState(false);
    const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

    const [error, setError] = useState<string | null>(null);

    // Tab state with URL hash support
    const getInitialTab = (): EnvTab => {
        const hash = window.location.hash.replace('#', '');
        if (hash === 'local-ai' || hash === 'system') return hash;
        return 'ai-engine';
    };
    const [activeTab, setActiveTab] = useState<EnvTab>(getInitialTab);

    // Update URL hash when tab changes
    const handleTabChange = (tab: EnvTab) => {
        setActiveTab(tab);
        window.history.replaceState(null, '', `#${tab}`);
    };

    // Listen for hash changes (back/forward navigation)
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.replace('#', '');
            if (hash === 'ai-engine' || hash === 'local-ai' || hash === 'system') {
                setActiveTab(hash);
            }
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    const kokoroMode = (env['KOKORO_MODE'] || 'local').toLowerCase();
    const showHfKokoroMode = showAdvancedKokoro || kokoroMode === 'hf';
    const gpuAvailable = (() => {
        const raw = (env['GPU_AVAILABLE'] || '').trim().toLowerCase();
        return ['1', 'true', 'yes', 'on'].includes(raw);
    })();

    useEffect(() => {
        if (!authLoading && token) {
            fetchEnv();
        }
    }, [authLoading, token]);

    const fetchEnv = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/config/env', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const loadedEnv = res.data || {};
            setEnv(loadedEnv);
            if ((loadedEnv['KOKORO_MODE'] || '').toLowerCase() === 'hf') {
                setShowAdvancedKokoro(true);
            }
            // After loading `.env`, check whether any running containers are out-of-sync.
            try {
                const statusRes = await axios.get('/api/config/env/status', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const plan = (statusRes.data?.apply_plan || []) as Array<{ service: string; method: string; endpoint: string }>;
                setApplyPlan(plan);
                setPendingRestart(Boolean(statusRes.data?.pending_restart));
            } catch {
                // Best-effort: status endpoint may be unavailable on older builds.
            }
        } catch (err: any) {
            console.error('Failed to load env', err);
            setError(err.response?.data?.detail || t('system.env.actions.loadingFailed') || 'Failed to load environment variables');
            if (err.response && err.response.status === 401) {
                // AuthContext handles logout
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        // Validate ARI Port
        const port = parseInt(env['ASTERISK_ARI_PORT'] || '8088');
        if (isNaN(port) || port < 1 || port > 65535) {
            toast.error(t('system.env.asterisk.invalidPort'));
            return;
        }

        setSaving(true);
        try {
            const envToSave = { ...env };
            // If file logging is enabled, ensure LOG_FILE_PATH is persisted (UI shows a recommended default).
            const logToFile = (envToSave['LOG_TO_FILE'] || '').toLowerCase();
            const logEnabled = logToFile === '1' || logToFile === 'true' || logToFile === 'on' || logToFile === 'yes';
            if (logEnabled && !(envToSave['LOG_FILE_PATH'] || '').trim()) {
                envToSave['LOG_FILE_PATH'] = '/mnt/asterisk_media/ai-engine.log';
            }

            const response = await axios.post('/api/config/env', envToSave, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const keys = (response.data?.changed_keys || []) as string[];
            setChangedKeys(keys);

            // Prefer drift-based status (source of truth for whether containers need recreate),
            // but fall back to the immediate apply_plan from the save response.
            let plan = (response.data?.apply_plan || []) as Array<{ service: string; method: string; endpoint: string }>;
            try {
                const statusRes = await axios.get('/api/config/env/status', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                plan = (statusRes.data?.apply_plan || plan) as Array<{ service: string; method: string; endpoint: string }>;
                setPendingRestart(Boolean(statusRes.data?.pending_restart));
            } catch {
                setPendingRestart(plan.length > 0);
            }
            setApplyPlan(plan);

            const services = Array.from(new Set(plan.map((p) => p.service))).sort();
            if (plan.length > 0) {
                toast.success(t('system.env.actions.saveSuccess'), { description: `${t('system.env.actions.restartServices')}: ${services.join(', ')}` });
            } else {
                toast.success(t('system.env.actions.saveSuccessNoRestart'));
            }
        } catch (err: any) {
            console.error('Failed to save env', err);
            if (err.response && err.response.status === 401) {
                toast.error(t('common.sessionExpired') || 'Session expired. Please login again.');
            } else {
                toast.error(t('system.env.actions.saveFailed'));
            }
        } finally {
            setSaving(false);
        }
    };

    const updateEnv = (key: string, value: string) => {
        setEnv(prev => ({ ...prev, [key]: value }));
    };

    const toggleSecret = (key: string) => {
        setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleApplyChanges = async (force: boolean = false) => {
        setRestartingEngine(true);
        try {
            if (!applyPlan || applyPlan.length === 0) {
                toast.info(t('system.env.actions.noChanges'));
                return;
            }
            // Apply in safe order: local_ai_server → ai_engine → admin_ui
            const ordered = ['local_ai_server', 'ai_engine', 'admin_ui'];
            const planByService = new Map(applyPlan.map((p) => [p.service, p]));

            // Warn if applying includes admin-ui restart (can invalidate sessions)
            const touchesAdminUI = planByService.has('admin_ui');
            const jwtChanged = changedKeys.includes('JWT_SECRET');
            if (touchesAdminUI) {
                const msg = jwtChanged
                    ? t('system.env.actions.jwtChangedLogout')
                    : t('system.env.actions.adminUiRestartWarning');
                const confirmed = await confirm({
                    title: t('system.env.actions.restartAdminUiTitle'),
                    description: msg,
                    confirmText: t('common.continue') || 'Continue',
                    variant: 'destructive'
                });
                if (!confirmed) return;
            }

            for (const service of ordered) {
                const step = planByService.get(service);
                if (!step) continue;

                if (service === 'ai_engine') {
                    // AAVA-161: Use recreate=true for env changes to ensure .env is re-read
                    const response = await axios.post(`${step.endpoint}?force=${force}&recreate=true`, {}, {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    if (response.data.status === 'warning') {
                        toast.warning(response.data.message, { description: 'Use force restart if needed.' });
                        return;
                    }

                    if (response.data.status === 'degraded') {
                        toast.warning('AI Engine restarted but may not be fully healthy', { description: response.data.output || 'Please verify manually' });
                        return;
                    }
                } else if (service === 'local_ai_server') {
                    // AAVA-161: Use recreate=true for env changes to ensure .env is re-read
                    await axios.post(`${step.endpoint}?recreate=true`, {}, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                } else {
                    await axios.post(step.endpoint, {}, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                }
            }

            setPendingRestart(false);
            setApplyPlan([]);
            toast.success('Changes applied');
        } catch (error: any) {
            toast.error('Failed to apply changes', { description: error.response?.data?.detail || error.message });
        } finally {
            setRestartingEngine(false);
        }
    };

    const testAriConnection = async () => {
        setAriTesting(true);
        setAriTestResult(null);

        try {
            const response = await axios.post('/api/system/test-ari', {
                host: env['ASTERISK_HOST'] || '127.0.0.1',
                port: parseInt(env['ASTERISK_ARI_PORT'] || '8088'),
                username: env['ASTERISK_ARI_USERNAME'] || '',
                password: env['ASTERISK_ARI_PASSWORD'] || '',
                scheme: env['ASTERISK_ARI_WEBSOCKET_SCHEME'] === 'wss' ? 'https' : 'http',
                ssl_verify: env['ASTERISK_ARI_SSL_VERIFY'] !== 'false'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setAriTestResult(response.data);
        } catch (err: any) {
            setAriTestResult({
                success: false,
                error: err.response?.data?.detail || 'Failed to test connection'
            });
        } finally {
            setAriTesting(false);
        }
    };

    const testSmtp = async () => {
        const toEmail = (smtpTestTo || '').trim();
        if (!toEmail) {
            toast.error(t('system.env.smtp.testRecipientRequired') || 'Enter a recipient email for the SMTP test.');
            return;
        }
        setSmtpTesting(true);
        setSmtpTestResult(null);
        try {
            const res = await axios.post('/api/config/env/smtp/test', {
                to_email: toEmail,
                from_email: (env['SMTP_USERNAME'] || '').trim() || undefined,
                smtp_host: (env['SMTP_HOST'] || '').trim() || undefined,
                smtp_port: (env['SMTP_PORT'] || '').trim() || undefined,
                smtp_username: (env['SMTP_USERNAME'] || '').trim() || undefined,
                smtp_password: (env['SMTP_PASSWORD'] || '').toString() || undefined,
                smtp_tls_mode: (env['SMTP_TLS_MODE'] || '').trim() || undefined,
                smtp_tls_verify: isTrue(env['SMTP_TLS_VERIFY'] || 'true'),
                smtp_timeout_seconds: (env['SMTP_TIMEOUT_SECONDS'] || '').trim() || undefined,
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSmtpTestResult({ success: true, message: res.data?.message || 'Test email accepted by SMTP server.' });
        } catch (err: any) {
            setSmtpTestResult({
                success: false,
                error: err.response?.data?.detail || err.message || 'SMTP test failed'
            });
        } finally {
            setSmtpTesting(false);
        }
    };

    // Helper to render SecretInput with current state
    const renderSecretInput = (label: string, envKey: string, placeholder?: string) => (
        <SecretInput
            label={label}
            placeholder={placeholder}
            value={env[envKey] || ''}
            onChange={(value) => updateEnv(envKey, value)}
            showSecret={showSecrets[envKey] || false}
            onToggleSecret={() => toggleSecret(envKey)}
        />
    );

    if (loading) return <div className="p-8 text-center text-muted-foreground">{t('system.env.actions.loading')}</div>;

    if (error) return (
        <div className="p-8 text-center text-destructive">
            <AlertTriangle className="w-8 h-8 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">{t('system.env.actions.errorTitle')}</h3>
            <p className="mt-2">{error}</p>
            <button
                onClick={fetchEnv}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
                {t('system.env.actions.retry')}
            </button>
        </div>
    );

    // Define known keys to exclude from "Other Variables"
    const knownKeys = [
        // AI Engine - Asterisk
        'ASTERISK_HOST', 'ASTERISK_ARI_USERNAME', 'ASTERISK_ARI_PASSWORD',
        'ASTERISK_ARI_PORT', 'ASTERISK_ARI_SCHEME', 'ASTERISK_ARI_WEBSOCKET_SCHEME', 'ASTERISK_ARI_SSL_VERIFY',
        'ASTERISK_APP_NAME', 'AST_MEDIA_DIR',
        // AI Engine - Diagnostics
        'DIAG_ENABLE_TAPS', 'DIAG_TAP_PRE_SECS', 'DIAG_TAP_POST_SECS', 'DIAG_TAP_OUTPUT_DIR',
        'DIAG_EGRESS_SWAP_MODE', 'DIAG_EGRESS_FORCE_MULAW', 'DIAG_ATTACK_MS',
        // AI Engine - Logging
        'LOG_LEVEL', 'LOG_FORMAT', 'LOG_COLOR', 'LOG_SHOW_TRACEBACKS',
        'STREAMING_LOG_LEVEL', 'LOG_TO_FILE', 'LOG_FILE_PATH',
        // AI Engine - Local AI Connection
        'LOCAL_WS_URL', 'LOCAL_WS_CONNECT_TIMEOUT', 'LOCAL_WS_RESPONSE_TIMEOUT', 'LOCAL_WS_CHUNK_MS',
        // AI Engine - Health Endpoint
        'HEALTH_BIND_HOST', 'HEALTH_BIND_PORT', 'HEALTH_API_TOKEN',
        // AI Engine - NAT/Hybrid Network
        'AUDIOSOCKET_ADVERTISE_HOST', 'EXTERNAL_MEDIA_ADVERTISE_HOST',
        // AI Engine - API Keys
        'OPENAI_API_KEY', 'GROQ_API_KEY', 'DEEPGRAM_API_KEY', 'GOOGLE_API_KEY', 'TELNYX_API_KEY', 'RESEND_API_KEY',
        'ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID', 'GOOGLE_APPLICATION_CREDENTIALS',
        'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION',
        // Email (SMTP)
        'SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_TLS_MODE', 'SMTP_TLS_VERIFY',
        'SMTP_TIMEOUT_SECONDS',
        // Local AI Server - Bind
        'LOCAL_WS_HOST', 'LOCAL_WS_PORT', 'LOCAL_WS_AUTH_TOKEN',
        // Local AI Server - Logging
        'LOCAL_LOG_LEVEL', 'LOCAL_DEBUG',
        // Local AI Server - Runtime
        'LOCAL_AI_MODE',
        // Local AI Server - STT backends
        'LOCAL_STT_BACKEND', 'LOCAL_STT_MODEL_PATH', 'LOCAL_STT_IDLE_TIMEOUT_MS',
        'KROKO_URL', 'KROKO_API_KEY', 'KROKO_LANGUAGE', 'KROKO_EMBEDDED', 'KROKO_MODEL_PATH', 'KROKO_PORT',
        'SHERPA_MODEL_PATH',
        'FASTER_WHISPER_MODEL', 'FASTER_WHISPER_DEVICE', 'FASTER_WHISPER_COMPUTE_TYPE', 'FASTER_WHISPER_LANGUAGE',
        // Local AI Server - TTS backends
        'LOCAL_TTS_BACKEND', 'LOCAL_TTS_MODEL_PATH',
        'KOKORO_VOICE', 'KOKORO_LANG', 'KOKORO_MODEL_PATH', 'KOKORO_MODE', 'KOKORO_API_BASE_URL', 'KOKORO_API_KEY',
        'MELOTTS_VOICE', 'MELOTTS_DEVICE', 'MELOTTS_SPEED',
        // Local AI Server - LLM
        'LOCAL_LLM_MODEL_PATH', 'LOCAL_LLM_THREADS',
        'LOCAL_LLM_CONTEXT', 'LOCAL_LLM_BATCH', 'LOCAL_LLM_MAX_TOKENS', 'LOCAL_LLM_TEMPERATURE', 'LOCAL_LLM_INFER_TIMEOUT_SEC',
        'LOCAL_LLM_GPU_LAYERS', 'LOCAL_LLM_TOP_P', 'LOCAL_LLM_REPEAT_PENALTY', 'LOCAL_LLM_USE_MLOCK',
        // System - General
        'TZ', 'JWT_SECRET', 'UVICORN_HOST', 'UVICORN_PORT',
        'HEALTH_CHECK_LOCAL_AI_URL', 'HEALTH_CHECK_AI_ENGINE_URL',
        // System - Container Permissions
        'ASTERISK_UID', 'ASTERISK_GID', 'DOCKER_GID',
        // System - Call History
        'CALL_HISTORY_ENABLED', 'CALL_HISTORY_RETENTION_DAYS', 'CALL_HISTORY_DB_PATH',
        // System - Outbound Campaign
        'AAVA_OUTBOUND_EXTENSION_IDENTITY', 'AAVA_OUTBOUND_AMD_CONTEXT', 'AAVA_MEDIA_DIR', 'AAVA_VM_UPLOAD_MAX_BYTES',
        'AAVA_OUTBOUND_PBX_TYPE', 'AAVA_OUTBOUND_DIAL_CONTEXT', 'AAVA_OUTBOUND_DIAL_PREFIX', 'AAVA_OUTBOUND_CHANNEL_TECH',
        // System - Docker Build Settings (build-time ARGs, require rebuild)
        'INCLUDE_VOSK', 'INCLUDE_SHERPA', 'INCLUDE_FASTER_WHISPER',
        'INCLUDE_PIPER', 'INCLUDE_KOKORO', 'INCLUDE_MELOTTS', 'INCLUDE_LLAMA', 'INCLUDE_KROKO_EMBEDDED',
        // Hidden/Internal (added to suppress from Other)
        'COMPOSE_PROJECT_NAME', 'GREETING', 'AI_GREETING', 'AI_NAME', 'AI_ROLE', 'HOST_PROJECT_ROOT', 'PROJECT_ROOT', 'GPU_AVAILABLE', 'INCLUDE_WHISPER_CPP',
        // Deprecated/Legacy
        'CARTESIA_API_KEY', 'LOCAL_FASTER_WHISPER_COMPUTE'
    ];

    const otherSettings = Object.keys(env).filter(k => !knownKeys.includes(k));

    // Helper to check boolean values (handles 'true', '1', 'on', etc.)
    const isTrue = (val: string | undefined) => {
        if (!val) return false;
        const v = val.toLowerCase();
        return v === 'true' || v === '1' || v === 'on' || v === 'yes';
    };

    const logFilePath = (env['LOG_FILE_PATH'] || '').trim();
    const defaultContainerMediaPrefix = '/mnt/asterisk_media/';
    const hostLogPathHint = logFilePath.startsWith(defaultContainerMediaPrefix)
        ? `./asterisk_media/${logFilePath.slice(defaultContainerMediaPrefix.length)}`
        : './asterisk_media/ai-engine.log';
    const logFilePathTooltip = logFilePath.startsWith(defaultContainerMediaPrefix) || !logFilePath
        ? t('system.env.logging.logFilePathTooltipInternal', { hostPath: hostLogPathHint })
        : t('system.env.logging.logFilePathTooltipExternal');

    return (
        <div className="space-y-6">
            {/* Global Restart Banner */}
            <div className={`${pendingRestart ? 'bg-orange-500/15 border-orange-500/30' : 'bg-yellow-500/10 border-yellow-500/20'} border text-yellow-600 dark:text-yellow-500 p-4 rounded-md flex items-center justify-between`}>
                <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {pendingRestart && applyPlan.length > 0
                        ? t('system.env.banners.pendingRestart', { services: Array.from(new Set(applyPlan.map((p) => p.service))).sort().join(', ') })
                        : t('system.env.banners.restartRequired')}
                </div>
                <button
                    onClick={() => handleApplyChanges(false)}
                    disabled={restartingEngine || applyPlan.length === 0}
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
                    {restartingEngine ? t('system.env.banners.applying') : t('system.env.banners.apply')}
                </button>
            </div>

            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('system.env.title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {t('system.env.desc')}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={async () => {
                            const confirmed = await confirm({
                                title: t('system.env.actions.wizardConfirmTitle'),
                                description: t('system.env.actions.wizardConfirmDesc'),
                                confirmText: t('common.continue') || 'Continue',
                                variant: 'destructive'
                            });
                            if (confirmed) {
                                window.location.href = '/wizard';
                            }
                        }}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('system.env.actions.setupWizard')}
                    </button>
                    <button
                        onClick={fetchEnv}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('system.env.actions.refresh')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {saving ? t('system.env.actions.saving') : t('system.env.actions.saveChanges')}
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-border">
                <div className="flex space-x-1">
                    <button
                        onClick={() => handleTabChange('ai-engine')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'ai-engine'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                            }`}
                    >
                        <Cpu className="w-4 h-4" />
                        {t('system.env.tabs.aiEngine')}
                    </button>
                    <button
                        onClick={() => handleTabChange('local-ai')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'local-ai'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                            }`}
                    >
                        <Server className="w-4 h-4" />
                        {t('system.env.tabs.localAi')}
                    </button>
                    <button
                        onClick={() => handleTabChange('system')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'system'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                            }`}
                    >
                        <Settings className="w-4 h-4" />
                        {t('system.env.tabs.system')}
                    </button>
                </div>
            </div>

            {/* ===== AI ENGINE TAB ===== */}
            {activeTab === 'ai-engine' && (
                <>
                    {/* Asterisk Settings */}
                    <ConfigSection title={t('system.env.asterisk.title')} description={t('system.env.asterisk.desc')}>
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label={t('system.env.asterisk.host')}
                                    value={env['ASTERISK_HOST'] || ''}
                                    onChange={(e) => updateEnv('ASTERISK_HOST', e.target.value)}
                                />
                                <FormInput
                                    label={t('system.env.asterisk.ariUsername')}
                                    value={env['ASTERISK_ARI_USERNAME'] || ''}
                                    onChange={(e) => updateEnv('ASTERISK_ARI_USERNAME', e.target.value)}
                                />
                                {renderSecretInput(t('system.env.asterisk.ariPassword'), 'ASTERISK_ARI_PASSWORD')}
                                <FormInput
                                    label={t('system.env.asterisk.ariPort')}
                                    type="number"
                                    value={env['ASTERISK_ARI_PORT'] || '8088'}
                                    onChange={(e) => updateEnv('ASTERISK_ARI_PORT', e.target.value)}
                                />
                                <FormSelect
                                    label={t('system.env.asterisk.wsScheme')}
                                    value={env['ASTERISK_ARI_WEBSOCKET_SCHEME'] || 'ws'}
                                    onChange={(e) => {
                                        const wsScheme = e.target.value;
                                        updateEnv('ASTERISK_ARI_WEBSOCKET_SCHEME', wsScheme);
                                        // Sync HTTP scheme: wss requires https, ws uses http
                                        updateEnv('ASTERISK_ARI_SCHEME', wsScheme === 'wss' ? 'https' : 'http');
                                    }}
                                    options={[
                                        { value: 'ws', label: t('system.env.asterisk.wsUnencrypted') },
                                        { value: 'wss', label: t('system.env.asterisk.wsEncrypted') },
                                    ]}
                                />
                                {env['ASTERISK_ARI_WEBSOCKET_SCHEME'] === 'wss' && (
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border border-input"
                                                checked={env['ASTERISK_ARI_SSL_VERIFY'] !== 'false'}
                                                onChange={(e) => updateEnv('ASTERISK_ARI_SSL_VERIFY', e.target.checked ? 'true' : 'false')}
                                            />
                                            {t('system.env.asterisk.verifySsl')}
                                        </label>
                                        <p className="text-xs text-muted-foreground">
                                            {t('system.env.asterisk.verifySslHint')}
                                        </p>
                                    </div>
                                )}
                                <FormInput
                                    label={t('system.env.asterisk.stasisApp')}
                                    value={env['ASTERISK_APP_NAME'] || 'asterisk-ai-voice-agent'}
                                    onChange={(e) => updateEnv('ASTERISK_APP_NAME', e.target.value)}
                                    tooltip={t('system.env.asterisk.stasisAppTooltip')}
                                />
                                <FormInput
                                    label={t('system.env.asterisk.mediaDir')}
                                    value={env['AST_MEDIA_DIR'] || '/mnt/asterisk_media/ai-generated'}
                                    onChange={(e) => updateEnv('AST_MEDIA_DIR', e.target.value)}
                                    tooltip={t('system.env.asterisk.mediaDirTooltip')}
                                />
                            </div>

                            {/* Test Connection Button */}
                            <div className="mt-6 pt-4 border-t">
                                <div className="flex items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={testAriConnection}
                                        disabled={ariTesting}
                                        className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                                    >
                                        {ariTesting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                {t('system.env.asterisk.testing')}
                                            </>
                                        ) : (
                                            t('system.env.asterisk.testConnection')
                                        )}
                                    </button>

                                    {ariTestResult && (
                                        <div className={`flex items-center gap-2 text-sm ${ariTestResult.success ? 'text-green-600' : 'text-red-600'}`}>
                                            {ariTestResult.success ? (
                                                <>
                                                    <CheckCircle className="w-4 h-4" />
                                                    <span>{ariTestResult.message || t('system.env.asterisk.testSuccess')}</span>
                                                    {ariTestResult.asterisk_version && (
                                                        <span className="text-muted-foreground ml-2">
                                                            (Asterisk {ariTestResult.asterisk_version})
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <XCircle className="w-4 h-4" />
                                                    <span>{ariTestResult.error || t('system.env.asterisk.testFailed')}</span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Cloud Provider API Keys */}
                    <ConfigSection title={t('system.env.cloud.title')} description={t('system.env.cloud.desc')}>
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {renderSecretInput('OpenAI API Key', 'OPENAI_API_KEY', 'sk-...')}
                                {renderSecretInput('Groq API Key', 'GROQ_API_KEY', 'gsk_...')}
                                {renderSecretInput('Deepgram API Key', 'DEEPGRAM_API_KEY', 'Token...')}
                                {renderSecretInput('Google API Key', 'GOOGLE_API_KEY', 'AIza...')}
                                {renderSecretInput('Telnyx API Key', 'TELNYX_API_KEY', 'KEY...')}
                                {renderSecretInput('ElevenLabs API Key', 'ELEVENLABS_API_KEY', 'xi-...')}
                                <FormInput
                                    label={t('system.env.cloud.elevenLabsAgent')}
                                    value={env['ELEVENLABS_AGENT_ID'] || ''}
                                    onChange={(e) => updateEnv('ELEVENLABS_AGENT_ID', e.target.value)}
                                    placeholder="agent_..."
                                    tooltip={t('system.env.cloud.elevenLabsAgentTooltip')}
                                />
                                {renderSecretInput('Resend API Key', 'RESEND_API_KEY', 're_...')}
                                <FormInput
                                    label={t('system.env.cloud.googleCreds')}
                                    value={env['GOOGLE_APPLICATION_CREDENTIALS'] || ''}
                                    onChange={(e) => updateEnv('GOOGLE_APPLICATION_CREDENTIALS', e.target.value)}
                                    placeholder="/path/to/service-account-key.json"
                                    tooltip={t('system.env.cloud.googleCredsTooltip')}
                                />
                                <FormInput
                                    label={t('system.env.cloud.gcpProject')}
                                    value={env['GOOGLE_CLOUD_PROJECT'] || ''}
                                    onChange={(e) => updateEnv('GOOGLE_CLOUD_PROJECT', e.target.value)}
                                    placeholder="my-gcp-project-id"
                                    tooltip={t('system.env.cloud.gcpProjectTooltip')}
                                />
                                <FormInput
                                    label={t('system.env.cloud.gcpLocation')}
                                    value={env['GOOGLE_CLOUD_LOCATION'] || ''}
                                    onChange={(e) => updateEnv('GOOGLE_CLOUD_LOCATION', e.target.value)}
                                    placeholder="us-central1"
                                    tooltip={t('system.env.cloud.gcpLocationTooltip')}
                                />
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Email Delivery (SMTP) */}
                    <ConfigSection
                        title={t('system.env.smtp.title')}
                        description={t('system.env.smtp.desc')}
                    >
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label={t('system.env.smtp.host')}
                                    value={env['SMTP_HOST'] || ''}
                                    onChange={(e) => updateEnv('SMTP_HOST', e.target.value)}
                                    placeholder="smtp.yourcompany.com"
                                    tooltip={t('system.env.smtp.hostTooltip')}
                                />
                                <FormInput
                                    label={t('system.env.smtp.port')}
                                    type="number"
                                    value={env['SMTP_PORT'] || ''}
                                    onChange={(e) => updateEnv('SMTP_PORT', e.target.value)}
                                    placeholder="587"
                                    tooltip={t('system.env.smtp.portTooltip')}
                                />
                                <FormInput
                                    label={t('system.env.smtp.username')}
                                    value={env['SMTP_USERNAME'] || ''}
                                    onChange={(e) => updateEnv('SMTP_USERNAME', e.target.value)}
                                    placeholder="username"
                                />
                                {renderSecretInput(t('system.env.smtp.password'), 'SMTP_PASSWORD', 'password')}
                                <FormSelect
                                    label={t('system.env.smtp.tlsMode')}
                                    options={[
                                        { value: 'starttls', label: t('system.env.smtp.tlsStarttls') },
                                        { value: 'smtps', label: t('system.env.smtp.tlsSmtps') },
                                        { value: 'none', label: t('system.env.smtp.tlsNone') },
                                    ]}
                                    value={env['SMTP_TLS_MODE'] || 'starttls'}
                                    onChange={(e) => updateEnv('SMTP_TLS_MODE', e.target.value)}
                                />
                                <FormSwitch
                                    label={t('system.env.smtp.verifyTls')}
                                    checked={isTrue(env['SMTP_TLS_VERIFY'] || 'true')}
                                    onChange={(e) => updateEnv('SMTP_TLS_VERIFY', e.target.checked ? 'true' : 'false')}
                                    description={t('system.env.smtp.verifyTlsDesc')}
                                />
                                <FormInput
                                    label={t('system.env.smtp.timeout')}
                                    type="number"
                                    value={env['SMTP_TIMEOUT_SECONDS'] || ''}
                                    onChange={(e) => updateEnv('SMTP_TIMEOUT_SECONDS', e.target.value)}
                                    placeholder="10"
                                />
                                <div className="md:col-span-2">
                                    <div className="flex flex-col md:flex-row md:items-end gap-3">
                                        <div className="flex-1">
                                            <FormInput
                                                label={t('system.env.smtp.testEmailLabel')}
                                                value={smtpTestTo}
                                                onChange={(e) => setSmtpTestTo(e.target.value)}
                                                placeholder="you@company.com"
                                                tooltip={t('system.env.smtp.testEmailTooltip')}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={testSmtp}
                                            disabled={smtpTesting}
                                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                                            title={t('system.env.smtp.sendTestTooltip')}
                                        >
                                            {smtpTesting ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    {t('system.env.smtp.sending')}
                                                </>
                                            ) : (
                                                t('system.env.smtp.sendTest')
                                            )}
                                        </button>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {t('system.env.smtp.testNote')}
                                    </p>
                                    {smtpTestResult && (
                                        <div className={`flex items-center gap-2 text-sm mt-2 ${smtpTestResult.success ? 'text-green-600' : 'text-red-600'}`}>
                                            {smtpTestResult.success ? (
                                                <>
                                                    <CheckCircle className="w-4 h-4" />
                                                    <span>{smtpTestResult.message || t('system.env.smtp.testSuccess')}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <XCircle className="w-4 h-4" />
                                                    <span>{smtpTestResult.error || t('system.env.smtp.testFailed')}</span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Health Endpoint */}
                    <ConfigSection title="Health Endpoint" description="Settings for the AI Engine health/metrics endpoint.">
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label="Bind Host"
                                    value={env['HEALTH_BIND_HOST'] || '127.0.0.1'}
                                    onChange={(e) => updateEnv('HEALTH_BIND_HOST', e.target.value)}
                                    placeholder="127.0.0.1"
                                    tooltip="Use 0.0.0.0 for remote monitoring access."
                                />
                                <FormInput
                                    label="Bind Port"
                                    type="number"
                                    value={env['HEALTH_BIND_PORT'] || '15000'}
                                    onChange={(e) => updateEnv('HEALTH_BIND_PORT', e.target.value)}
                                    placeholder="15000"
                                />
                                {renderSecretInput(t('system.env.health.apiToken') || "API Token", 'HEALTH_API_TOKEN', t('system.env.health.apiTokenTooltip') || 'Required for remote access to sensitive endpoints')}
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* NAT/Hybrid Network */}
                    <ConfigSection title={t('system.env.nat.title')} description={t('system.env.nat.desc')}>
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label={t('system.env.nat.audiosocketAdvertise')}
                                    value={env['AUDIOSOCKET_ADVERTISE_HOST'] || ''}
                                    onChange={(e) => updateEnv('AUDIOSOCKET_ADVERTISE_HOST', e.target.value)}
                                    placeholder="10.8.0.5"
                                    tooltip={t('system.env.nat.audiosocketAdvertiseTooltip')}
                                />
                                <FormInput
                                    label={t('system.env.nat.externalMediaAdvertise')}
                                    value={env['EXTERNAL_MEDIA_ADVERTISE_HOST'] || ''}
                                    onChange={(e) => updateEnv('EXTERNAL_MEDIA_ADVERTISE_HOST', e.target.value)}
                                    placeholder="10.8.0.5"
                                    tooltip={t('system.env.nat.externalMediaAdvertiseTooltip')}
                                />
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Local AI Connection */}
                    <ConfigSection title={t('system.env.localAiConn.title')} description={t('system.env.localAiConn.desc')}>
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label={t('system.env.localAiConn.wsUrl')}
                                    value={env['LOCAL_WS_URL'] || ''}
                                    onChange={(e) => updateEnv('LOCAL_WS_URL', e.target.value)}
                                    placeholder="ws://local-ai-server:8000/ws"
                                    tooltip={t('system.env.localAiConn.wsUrlTooltip')}
                                />
                                {renderSecretInput(t('system.env.localAiConn.authToken'), 'LOCAL_WS_AUTH_TOKEN', t('system.env.localAiConn.authTokenTooltip'))}
                                <FormInput
                                    label={t('system.env.localAiConn.chunkMs')}
                                    type="number"
                                    value={env['LOCAL_WS_CHUNK_MS'] || '160'}
                                    onChange={(e) => updateEnv('LOCAL_WS_CHUNK_MS', e.target.value)}
                                    tooltip={t('system.env.localAiConn.chunkMsTooltip')}
                                />
                                <FormInput
                                    label={t('system.env.localAiConn.connectTimeout')}
                                    type="number"
                                    value={env['LOCAL_WS_CONNECT_TIMEOUT'] || '5'}
                                    onChange={(e) => updateEnv('LOCAL_WS_CONNECT_TIMEOUT', e.target.value)}
                                />
                                <FormInput
                                    label={t('system.env.localAiConn.responseTimeout')}
                                    type="number"
                                    value={env['LOCAL_WS_RESPONSE_TIMEOUT'] || '10'}
                                    onChange={(e) => updateEnv('LOCAL_WS_RESPONSE_TIMEOUT', e.target.value)}
                                />
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Logging & Diagnostics */}
                    <ConfigSection title={t('system.env.logging.title')} description={t('system.env.logging.desc')}>
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormSelect
                                    label={t('system.env.logging.logLevel')}
                                    value={env['LOG_LEVEL'] || 'INFO'}
                                    onChange={(e) => updateEnv('LOG_LEVEL', e.target.value)}
                                    options={[
                                        { value: 'DEBUG', label: 'DEBUG' },
                                        { value: 'INFO', label: 'INFO' },
                                        { value: 'WARNING', label: 'WARNING' },
                                        { value: 'ERROR', label: 'ERROR' },
                                    ]}
                                    tooltip={t('system.env.logging.logLevelTooltip')}
                                />
                                <FormSelect
                                    label={t('system.env.logging.streamingLogLevel')}
                                    value={env['STREAMING_LOG_LEVEL'] || 'INFO'}
                                    onChange={(e) => updateEnv('STREAMING_LOG_LEVEL', e.target.value)}
                                    options={[
                                        { value: 'DEBUG', label: 'DEBUG' },
                                        { value: 'INFO', label: 'INFO' },
                                        { value: 'WARNING', label: 'WARNING' },
                                        { value: 'ERROR', label: 'ERROR' },
                                    ]}
                                    tooltip={t('system.env.logging.streamingLogLevelTooltip')}
                                />
                                <FormInput
                                    label={t('system.env.logging.logFilePath')}
                                    value={env['LOG_FILE_PATH'] || ''}
                                    onChange={(e) => updateEnv('LOG_FILE_PATH', e.target.value)}
                                    placeholder="/mnt/asterisk_media/ai-engine.log"
                                    tooltip={logFilePathTooltip}
                                />
                                <FormSwitch
                                    label={t('system.env.logging.logToFile')}
                                    checked={isTrue(env['LOG_TO_FILE'])}
                                    onChange={(e) => updateEnv('LOG_TO_FILE', e.target.checked ? 'true' : 'false')}
                                    description={t('system.env.logging.logToFileDesc')}
                                />
                                <FormSelect
                                    label={t('system.env.logging.logFormat')}
                                    value={env['LOG_FORMAT'] || 'basic'}
                                    onChange={(e) => updateEnv('LOG_FORMAT', e.target.value)}
                                    options={[
                                        { value: 'basic', label: 'Basic' },
                                        { value: 'rich', label: 'Rich (Structured)' },
                                    ]}
                                    tooltip={t('system.env.logging.logFormatTooltip')}
                                />
                                <FormSwitch
                                    label={t('system.env.logging.logColor')}
                                    checked={isTrue(env['LOG_COLOR'] || 'true')}
                                    onChange={(e) => updateEnv('LOG_COLOR', e.target.checked ? 'true' : 'false')}
                                />
                                <FormSwitch
                                    label={t('system.env.logging.showTracebacks')}
                                    checked={isTrue(env['LOG_SHOW_TRACEBACKS'] || 'true')}
                                    onChange={(e) => updateEnv('LOG_SHOW_TRACEBACKS', e.target.checked ? 'true' : 'false')}
                                />
                                <div className="md:col-span-2 border-t pt-6 mt-2">
                                    <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                                        {t('system.env.logging.diagTaps')}
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormSwitch
                                            label={t('system.env.logging.diagTaps')}
                                            checked={isTrue(env['DIAG_ENABLE_TAPS'])}
                                            onChange={(e) => updateEnv('DIAG_ENABLE_TAPS', e.target.checked ? 'true' : 'false')}
                                            description={t('system.env.logging.diagTapsDesc')}
                                        />
                                        <FormInput
                                            label={t('system.env.logging.outputDir')}
                                            value={env['DIAG_TAP_OUTPUT_DIR'] || '/mnt/asterisk_media/taps'}
                                            onChange={(e) => updateEnv('DIAG_TAP_OUTPUT_DIR', e.target.value)}
                                            placeholder="/mnt/asterisk_media/taps"
                                        />
                                        <FormInput
                                            label={t('system.env.logging.preSecs')}
                                            type="number"
                                            value={env['DIAG_TAP_PRE_SECS'] || '5'}
                                            onChange={(e) => updateEnv('DIAG_TAP_PRE_SECS', e.target.value)}
                                        />
                                        <FormInput
                                            label={t('system.env.logging.postSecs')}
                                            type="number"
                                            value={env['DIAG_TAP_POST_SECS'] || '5'}
                                            onChange={(e) => updateEnv('DIAG_TAP_POST_SECS', e.target.value)}
                                        />
                                        <FormSelect
                                            label={t('system.env.logging.egressSwap')}
                                            value={env['DIAG_EGRESS_SWAP_MODE'] || 'none'}
                                            onChange={(e) => updateEnv('DIAG_EGRESS_SWAP_MODE', e.target.value)}
                                            options={[
                                                { value: 'none', label: 'None (Normal)' },
                                                { value: 'all', label: 'Swap All Agent Audio' },
                                            ]}
                                            tooltip={t('system.env.logging.egressSwapTooltip')}
                                        />
                                        <FormSwitch
                                            label={t('system.env.logging.forceMulaw')}
                                            checked={isTrue(env['DIAG_EGRESS_FORCE_MULAW'])}
                                            onChange={(e) => updateEnv('DIAG_EGRESS_FORCE_MULAW', e.target.checked ? 'true' : 'false')}
                                        />
                                        <FormInput
                                            label={t('system.env.logging.attackMs')}
                                            type="number"
                                            value={env['DIAG_ATTACK_MS'] || '20'}
                                            onChange={(e) => updateEnv('DIAG_ATTACK_MS', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </ConfigCard>
                    </ConfigSection>
                </>
            )}

            {/* ===== LOCAL AI SERVER TAB ===== */}
            {activeTab === 'local-ai' && (
                <>
                    {/* Server Bind Settings */}
                    <ConfigSection title={t('system.env.localAiServer.bind.title')} description={t('system.env.localAiServer.bind.desc')}>
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label={t('system.env.localAiServer.bind.host')}
                                    value={env['LOCAL_WS_HOST'] || '0.0.0.0'}
                                    onChange={(e) => updateEnv('LOCAL_WS_HOST', e.target.value)}
                                    tooltip={t('system.env.localAiServer.bind.hostTooltip')}
                                />
                                <FormInput
                                    label={t('system.env.localAiServer.bind.port')}
                                    type="number"
                                    value={env['LOCAL_WS_PORT'] || '8765'}
                                    onChange={(e) => updateEnv('LOCAL_WS_PORT', e.target.value)}
                                    tooltip={t('system.env.localAiServer.bind.portTooltip')}
                                />
                                <FormInput
                                    label={t('system.env.localAiServer.bind.authToken')}
                                    type="password"
                                    value={env['LOCAL_WS_AUTH_TOKEN'] || ''}
                                    onChange={(e) => updateEnv('LOCAL_WS_AUTH_TOKEN', e.target.value)}
                                    tooltip={t('system.env.localAiServer.bind.authTokenTooltip')}
                                />
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Runtime & Logging */}
                    <ConfigSection title={t('system.env.localAiServer.runtime.title')} description={t('system.env.localAiServer.runtime.desc')}>
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormSelect
                                    label={t('system.env.localAiServer.runtime.mode')}
                                    value={env['LOCAL_AI_MODE'] || 'full'}
                                    onChange={(e) => updateEnv('LOCAL_AI_MODE', e.target.value)}
                                    options={[
                                        { value: 'full', label: t('system.env.localAiServer.runtime.modeFull') },
                                        { value: 'minimal', label: t('system.env.localAiServer.runtime.modeMinimal') },
                                    ]}
                                    tooltip={t('system.env.localAiServer.runtime.modeTooltip')}
                                />
                                <FormSelect
                                    label={t('system.env.localAiServer.runtime.logLevel')}
                                    value={(env['LOCAL_LOG_LEVEL'] || 'INFO').toUpperCase()}
                                    onChange={(e) => updateEnv('LOCAL_LOG_LEVEL', e.target.value)}
                                    options={[
                                        { value: 'DEBUG', label: 'Debug' },
                                        { value: 'INFO', label: 'Info' },
                                        { value: 'WARNING', label: 'Warning' },
                                        { value: 'ERROR', label: 'Error' },
                                    ]}
                                />
                                <FormSwitch
                                    id="local-debug"
                                    label={t('system.env.localAiServer.runtime.verboseDebug')}
                                    description={t('system.env.localAiServer.runtime.verboseDebugDesc')}
                                    checked={isTrue(env['LOCAL_DEBUG'])}
                                    onChange={(e) => updateEnv('LOCAL_DEBUG', e.target.checked ? '1' : '0')}
                                />
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* STT Backend Settings */}
                    <ConfigSection title={t('system.env.localAiServer.stt.title')} description={t('system.env.localAiServer.stt.desc')}>
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormSelect
                                    label={t('system.env.localAiServer.stt.backend')}
                                    value={env['LOCAL_STT_BACKEND'] || 'vosk'}
                                    onChange={(e) => updateEnv('LOCAL_STT_BACKEND', e.target.value)}
                                    options={[
                                        { value: 'vosk', label: 'Vosk (Local)' },
                                        { value: 'kroko', label: 'Kroko (Cloud/Embedded)' },
                                        { value: 'sherpa', label: 'Sherpa-ONNX (Local)' },
                                        { value: 'faster_whisper', label: 'Faster Whisper (High Accuracy)' },
                                    ]}
                                />
                                <FormInput
                                    label={t('system.env.localAiServer.stt.idleTimeout')}
                                    type="number"
                                    value={env['LOCAL_STT_IDLE_TIMEOUT_MS'] || '3000'}
                                    onChange={(e) => updateEnv('LOCAL_STT_IDLE_TIMEOUT_MS', e.target.value)}
                                    tooltip={t('system.env.localAiServer.stt.idleTimeoutTooltip')}
                                />

                                {/* Vosk Settings */}
                                {(env['LOCAL_STT_BACKEND'] || 'vosk') === 'vosk' && (
                                    <FormInput
                                        label={t('system.env.localAiServer.stt.voskModel')}
                                        value={env['LOCAL_STT_MODEL_PATH'] || '/app/models/stt/vosk-model-en-us-0.22'}
                                        onChange={(e) => updateEnv('LOCAL_STT_MODEL_PATH', e.target.value)}
                                    />
                                )}

                                {/* Kroko Settings */}
                                {env['LOCAL_STT_BACKEND'] === 'kroko' && (
                                    <>
                                        <FormSwitch
                                            id="kroko-embedded"
                                            label={t('system.env.localAiServer.stt.krokoEmbedded')}
                                            description={t('system.env.localAiServer.stt.krokoEmbeddedDesc')}
                                            checked={isTrue(env['KROKO_EMBEDDED'])}
                                            onChange={(e) => updateEnv('KROKO_EMBEDDED', String(e.target.checked))}
                                        />
                                        {isTrue(env['KROKO_EMBEDDED']) ? (
                                            <>
                                                <FormInput
                                                    label={t('system.env.localAiServer.stt.krokoModel')}
                                                    value={env['KROKO_MODEL_PATH'] || '/app/models/stt/kroko'}
                                                    onChange={(e) => updateEnv('KROKO_MODEL_PATH', e.target.value)}
                                                />
                                                <FormInput
                                                    label={t('system.env.localAiServer.stt.krokoPort')}
                                                    type="number"
                                                    value={env['KROKO_PORT'] || '6006'}
                                                    onChange={(e) => updateEnv('KROKO_PORT', e.target.value)}
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <FormInput
                                                    label={t('system.env.localAiServer.stt.krokoUrl')}
                                                    value={env['KROKO_URL'] || 'wss://app.kroko.ai/api/v1/transcripts/streaming'}
                                                    onChange={(e) => updateEnv('KROKO_URL', e.target.value)}
                                                />
                                                {renderSecretInput(t('system.env.localAiServer.stt.krokoApiKey'), 'KROKO_API_KEY', t('system.env.localAiServer.stt.krokoApiKeyTooltip'))}
                                            </>
                                        )}
                                        <FormSelect
                                            label={t('system.env.localAiServer.stt.language')}
                                            value={env['KROKO_LANGUAGE'] || 'en-US'}
                                            onChange={(e) => updateEnv('KROKO_LANGUAGE', e.target.value)}
                                            options={[
                                                { value: 'en-US', label: 'English (US)' },
                                                { value: 'en-GB', label: 'English (UK)' },
                                                { value: 'es-ES', label: 'Spanish' },
                                                { value: 'fr-FR', label: 'French' },
                                                { value: 'de-DE', label: 'German' },
                                            ]}
                                        />
                                    </>
                                )}

                                {/* Sherpa Settings */}
                                {env['LOCAL_STT_BACKEND'] === 'sherpa' && (
                                    <FormInput
                                        label={t('system.env.localAiServer.stt.sherpaModel')}
                                        value={env['SHERPA_MODEL_PATH'] || '/app/models/stt/sherpa-onnx-streaming-zipformer-en-2023-06-26'}
                                        onChange={(e) => updateEnv('SHERPA_MODEL_PATH', e.target.value)}
                                    />
                                )}

                                {/* Faster Whisper Settings */}
                                {env['LOCAL_STT_BACKEND'] === 'faster_whisper' && (
                                    <>
                                        <FormSelect
                                            label={t('system.env.localAiServer.stt.whisperModel')}
                                            value={env['FASTER_WHISPER_MODEL'] || 'base'}
                                            onChange={(e) => updateEnv('FASTER_WHISPER_MODEL', e.target.value)}
                                            options={[
                                                { value: 'tiny', label: 'Tiny (Fastest)' },
                                                { value: 'base', label: 'Base' },
                                                { value: 'small', label: 'Small' },
                                                { value: 'medium', label: 'Medium' },
                                                { value: 'large-v2', label: 'Large v2' },
                                                { value: 'large-v3', label: 'Large v3 (Best)' },
                                            ]}
                                        />
                                        <FormSelect
                                            label={t('system.env.localAiServer.stt.whisperDevice')}
                                            value={env['FASTER_WHISPER_DEVICE'] || 'cpu'}
                                            onChange={(e) => updateEnv('FASTER_WHISPER_DEVICE', e.target.value)}
                                            options={[
                                                { value: 'cpu', label: 'CPU' },
                                                ...(gpuAvailable ? [{ value: 'cuda', label: 'CUDA (GPU)' }] : []),
                                                { value: 'auto', label: 'Auto' },
                                            ]}
                                        />
                                        <FormSelect
                                            label={t('system.env.localAiServer.stt.whisperCompute')}
                                            value={env['FASTER_WHISPER_COMPUTE_TYPE'] || 'int8'}
                                            onChange={(e) => updateEnv('FASTER_WHISPER_COMPUTE_TYPE', e.target.value)}
                                            options={[
                                                { value: 'int8', label: 'INT8 (Fastest)' },
                                                { value: 'float16', label: 'Float16' },
                                                { value: 'float32', label: 'Float32 (Best)' },
                                            ]}
                                        />
                                        <FormInput
                                            label={t('system.env.localAiServer.stt.language')}
                                            value={env['FASTER_WHISPER_LANGUAGE'] || 'en'}
                                            onChange={(e) => updateEnv('FASTER_WHISPER_LANGUAGE', e.target.value)}
                                            placeholder="en"
                                            tooltip={t('system.env.localAiServer.stt.whisperLanguageTooltip')}
                                        />
                                    </>
                                )}
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* TTS Backend Settings */}
                    <ConfigSection title={t('system.env.localAiServer.tts.title')} description={t('system.env.localAiServer.tts.desc')}>
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormSelect
                                    label={t('system.env.localAiServer.tts.backend')}
                                    value={env['LOCAL_TTS_BACKEND'] || 'piper'}
                                    onChange={(e) => updateEnv('LOCAL_TTS_BACKEND', e.target.value)}
                                    options={[
                                        { value: 'piper', label: 'Piper (Local)' },
                                        { value: 'kokoro', label: 'Kokoro (Local, Premium)' },
                                        { value: 'melotts', label: 'MeloTTS (CPU-Optimized)' },
                                    ]}
                                />

                                {/* Piper Settings */}
                                {(env['LOCAL_TTS_BACKEND'] || 'piper') === 'piper' && (
                                    <FormInput
                                        label={t('system.env.localAiServer.tts.piperModel')}
                                        value={env['LOCAL_TTS_MODEL_PATH'] || '/app/models/tts/en_US-lessac-medium.onnx'}
                                        onChange={(e) => updateEnv('LOCAL_TTS_MODEL_PATH', e.target.value)}
                                    />
                                )}

                                {/* Kokoro Settings */}
                                {env['LOCAL_TTS_BACKEND'] === 'kokoro' && (
                                    <>
                                        <FormSelect
                                            label={t('system.env.localAiServer.tts.kokoroMode')}
                                            value={kokoroMode}
                                            onChange={(e) => updateEnv('KOKORO_MODE', e.target.value)}
                                            options={[
                                                { value: 'local', label: t('system.env.localAiServer.tts.kokoroModeLocal') },
                                                { value: 'api', label: t('system.env.localAiServer.tts.kokoroModeApi') },
                                                ...(showHfKokoroMode ? [{ value: 'hf', label: t('system.env.localAiServer.tts.kokoroModeHf') }] : []),
                                            ]}
                                        />
                                        <div className="col-span-full">
                                            <FormSwitch
                                                id="kokoro-advanced"
                                                label={t('system.env.localAiServer.tts.kokoroAdvanced')}
                                                description={t('system.env.localAiServer.tts.kokoroAdvancedDesc')}
                                                checked={showAdvancedKokoro}
                                                onChange={(e) => setShowAdvancedKokoro(e.target.checked)}
                                            />
                                        </div>
                                        <FormSelect
                                            label={t('system.env.localAiServer.tts.kokoroVoice')}
                                            value={env['KOKORO_VOICE'] || 'af_heart'}
                                            onChange={(e) => updateEnv('KOKORO_VOICE', e.target.value)}
                                            options={[
                                                { value: 'af_heart', label: 'Heart (Female, American)' },
                                                { value: 'af_bella', label: 'Bella (Female, American)' },
                                                { value: 'af_nicole', label: 'Nicole (Female, American)' },
                                                { value: 'af_sarah', label: 'Sarah (Female, American)' },
                                                { value: 'af_sky', label: 'Sky (Female, American)' },
                                                { value: 'am_adam', label: 'Adam (Male, American)' },
                                                { value: 'am_michael', label: 'Michael (Male, American)' },
                                                { value: 'bf_emma', label: 'Emma (Female, British)' },
                                                { value: 'bf_isabella', label: 'Isabella (Female, British)' },
                                                { value: 'bm_george', label: 'George (Male, British)' },
                                                { value: 'bm_lewis', label: 'Lewis (Male, British)' },
                                            ]}
                                        />
                                        {kokoroMode === 'api' ? (
                                            <>
                                                <FormInput
                                                    label={t('system.env.localAiServer.tts.kokoroApiUrl')}
                                                    value={env['KOKORO_API_BASE_URL'] || 'https://voice-generator.pages.dev/api/v1'}
                                                    onChange={(e) => updateEnv('KOKORO_API_BASE_URL', e.target.value)}
                                                />
                                                {renderSecretInput(
                                                    t('system.env.localAiServer.tts.kokoroApiKey'),
                                                    'KOKORO_API_KEY',
                                                    t('system.env.localAiServer.tts.kokoroApiKeyTooltip')
                                                )}
                                            </>
                                        ) : kokoroMode === 'hf' ? (
                                            <div className="text-xs text-muted-foreground">
                                                {t('system.env.localAiServer.tts.kokoroHfWarning')}
                                            </div>
                                        ) : (
                                            <FormInput
                                                label={t('system.env.localAiServer.tts.kokoroModel')}
                                                value={env['KOKORO_MODEL_PATH'] || '/app/models/tts/kokoro-v0_19.onnx'}
                                                onChange={(e) => updateEnv('KOKORO_MODEL_PATH', e.target.value)}
                                            />
                                        )}
                                    </>
                                )}

                                {/* MeloTTS Settings */}
                                {env['LOCAL_TTS_BACKEND'] === 'melotts' && (
                                    <>
                                        <FormInput
                                            label={t('system.env.localAiServer.tts.meloModel')}
                                            value={env['MELO_MODEL_PATH'] || '/app/models/tts/melo'}
                                            onChange={(e) => updateEnv('MELO_MODEL_PATH', e.target.value)}
                                        />
                                        <FormInput
                                            label={t('system.env.localAiServer.tts.meloConfig')}
                                            value={env['MELO_CONFIG_PATH'] || '/app/models/tts/melo/config.json'}
                                            onChange={(e) => updateEnv('MELO_CONFIG_PATH', e.target.value)}
                                        />
                                    </>
                                )}
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* LLM Settings */}
                    <ConfigSection title="LLM (Large Language Model)" description="Local language model for pipeline-based processing.">
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="col-span-full">
                                    <FormInput
                                        label="LLM Model Path"
                                        value={env['LOCAL_LLM_MODEL_PATH'] || '/app/models/llm/phi-3-mini-4k-instruct.Q4_K_M.gguf'}
                                        onChange={(e) => updateEnv('LOCAL_LLM_MODEL_PATH', e.target.value)}
                                    />
                                </div>
                                <FormInput
                                    label="Context Size"
                                    type="number"
                                    value={env['LOCAL_LLM_CONTEXT'] || '4096'}
                                    onChange={(e) => updateEnv('LOCAL_LLM_CONTEXT', e.target.value)}
                                />
                                <FormInput
                                    label="Batch Size"
                                    type="number"
                                    value={env['LOCAL_LLM_BATCH'] || '256'}
                                    onChange={(e) => updateEnv('LOCAL_LLM_BATCH', e.target.value)}
                                />
                                <FormInput
                                    label="Max Tokens"
                                    type="number"
                                    value={env['LOCAL_LLM_MAX_TOKENS'] || '128'}
                                    onChange={(e) => updateEnv('LOCAL_LLM_MAX_TOKENS', e.target.value)}
                                />
                                <FormInput
                                    label="Temperature"
                                    type="number"
                                    step="0.1"
                                    value={env['LOCAL_LLM_TEMPERATURE'] || '0.7'}
                                    onChange={(e) => updateEnv('LOCAL_LLM_TEMPERATURE', e.target.value)}
                                />
                                <FormInput
                                    label="Threads"
                                    type="number"
                                    value={env['LOCAL_LLM_THREADS'] || '4'}
                                    onChange={(e) => updateEnv('LOCAL_LLM_THREADS', e.target.value)}
                                />
                                <FormInput
                                    label="Infer Timeout (s)"
                                    type="number"
                                    value={env['LOCAL_LLM_INFER_TIMEOUT_SEC'] || '30'}
                                    onChange={(e) => updateEnv('LOCAL_LLM_INFER_TIMEOUT_SEC', e.target.value)}
                                />
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Advanced LLM Settings */}
                    <ConfigSection title="Advanced LLM Settings" description="GPU acceleration and fine-tuning parameters.">
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label="GPU Layers"
                                    type="number"
                                    value={env['LOCAL_LLM_GPU_LAYERS'] || '0'}
                                    onChange={(e) => updateEnv('LOCAL_LLM_GPU_LAYERS', e.target.value)}
                                    tooltip="0=CPU only, -1=Auto-detect GPU, N=Offload N layers to GPU"
                                />
                                <FormInput
                                    label="Top P"
                                    type="number"
                                    step="0.01"
                                    value={env['LOCAL_LLM_TOP_P'] || '0.85'}
                                    onChange={(e) => updateEnv('LOCAL_LLM_TOP_P', e.target.value)}
                                    tooltip="Nucleus sampling (0.8-0.95)"
                                />
                                <FormInput
                                    label="Repeat Penalty"
                                    type="number"
                                    step="0.01"
                                    value={env['LOCAL_LLM_REPEAT_PENALTY'] || '1.05'}
                                    onChange={(e) => updateEnv('LOCAL_LLM_REPEAT_PENALTY', e.target.value)}
                                    tooltip="Repetition penalty (1.0-1.2)"
                                />
                                <FormSwitch
                                    id="llm-mlock"
                                    label="Lock Model in RAM"
                                    description="Prevent model from being swapped to disk (requires privileges)."
                                    checked={isTrue(env['LOCAL_LLM_USE_MLOCK'])}
                                    onChange={(e) => updateEnv('LOCAL_LLM_USE_MLOCK', e.target.checked ? '1' : '0')}
                                />
                            </div>
                        </ConfigCard>
                    </ConfigSection>
                </>
            )}

            {/* ===== SYSTEM TAB ===== */}
            {activeTab === 'system' && (
                <>
                    {/* Time Zone */}
                    <ConfigSection title="Time Zone" description="Timezone used for timestamps and scheduling.">
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label="TZ"
                                    tooltip="IANA timezone name (e.g., America/Phoenix). Leave empty for UTC."
                                    value={env['TZ'] || ''}
                                    onChange={(e) => updateEnv('TZ', e.target.value)}
                                    placeholder="America/Phoenix"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground mt-3">
                                <strong>Affects:</strong> AI Engine, Local AI Server, Admin UI
                            </p>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Authentication */}
                    <ConfigSection title="Authentication" description="Security settings for Admin UI.">
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {renderSecretInput('JWT Secret', 'JWT_SECRET', 'Secret key for auth tokens')}
                            </div>
                            <p className="text-xs text-muted-foreground mt-3">
                                Changing JWT Secret will invalidate all active sessions.
                            </p>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Admin UI Server */}
                    <ConfigSection title="Admin UI Server" description="Network settings for the Admin UI web server.">
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label="Bind Address"
                                    value={env['UVICORN_HOST'] || '0.0.0.0'}
                                    onChange={(e) => updateEnv('UVICORN_HOST', e.target.value)}
                                    placeholder="0.0.0.0"
                                    tooltip="IP address the Admin UI binds to. Use 0.0.0.0 for all interfaces or 127.0.0.1 for local-only access."
                                />
                                <FormInput
                                    label="Port"
                                    type="number"
                                    value={env['UVICORN_PORT'] || '3003'}
                                    onChange={(e) => updateEnv('UVICORN_PORT', e.target.value)}
                                    placeholder="3003"
                                    tooltip="Port number for the Admin UI. Default is 3003."
                                />
                            </div>
                            <p className="text-xs text-muted-foreground mt-3">
                                <strong>Note:</strong> Changes require Admin UI container restart to take effect.
                            </p>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Health Check URLs */}
                    <ConfigSection title="Health Check URLs" description="Internal URLs used for system health monitoring.">
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label="Local AI Health URL"
                                    value={env['HEALTH_CHECK_LOCAL_AI_URL'] || 'ws://local_ai_server:8765'}
                                    onChange={(e) => updateEnv('HEALTH_CHECK_LOCAL_AI_URL', e.target.value)}
                                    placeholder="ws://local_ai_server:8765"
                                />
                                <FormInput
                                    label="AI Engine Health URL"
                                    value={env['HEALTH_CHECK_AI_ENGINE_URL'] || 'http://ai_engine:15000/health'}
                                    onChange={(e) => updateEnv('HEALTH_CHECK_AI_ENGINE_URL', e.target.value)}
                                    placeholder="http://ai_engine:15000/health"
                                />
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Call History */}
                    <ConfigSection title="Call History" description="Settings for call history persistence and retention.">
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormSwitch
                                    id="call-history-enabled"
                                    label="Enable Call History"
                                    description="Record call history for debugging and analytics."
                                    checked={isTrue(env['CALL_HISTORY_ENABLED'])}
                                    onChange={(e) => updateEnv('CALL_HISTORY_ENABLED', e.target.checked ? 'true' : 'false')}
                                />
                                <FormInput
                                    label="Retention Days"
                                    type="number"
                                    value={env['CALL_HISTORY_RETENTION_DAYS'] || '0'}
                                    onChange={(e) => updateEnv('CALL_HISTORY_RETENTION_DAYS', e.target.value)}
                                    tooltip="0 = unlimited (keep forever)"
                                />
                                <div className="col-span-full">
                                    <FormInput
                                        label="Database Path"
                                        value={env['CALL_HISTORY_DB_PATH'] || 'data/call_history.db'}
                                        onChange={(e) => updateEnv('CALL_HISTORY_DB_PATH', e.target.value)}
                                        placeholder="data/call_history.db"
                                    />
                                </div>
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Outbound Campaign */}
                    <ConfigSection title="Outbound Campaign (Alpha)" description="Settings for outbound calling campaigns.">
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label="Extension Identity"
                                    value={env['AAVA_OUTBOUND_EXTENSION_IDENTITY'] || '6789'}
                                    onChange={(e) => updateEnv('AAVA_OUTBOUND_EXTENSION_IDENTITY', e.target.value)}
                                    tooltip="Extension used for FreePBX routing (sets AMPUSER + CALLERID)."
                                />
                                <FormInput
                                    label="AMD Context"
                                    value={env['AAVA_OUTBOUND_AMD_CONTEXT'] || 'aava-outbound-amd'}
                                    onChange={(e) => updateEnv('AAVA_OUTBOUND_AMD_CONTEXT', e.target.value)}
                                    tooltip="Dialplan context for AMD hop."
                                />
                                <FormSelect
                                    label="PBX Type"
                                    value={env['AAVA_OUTBOUND_PBX_TYPE'] || 'freepbx'}
                                    onChange={(e) => updateEnv('AAVA_OUTBOUND_PBX_TYPE', e.target.value)}
                                    options={[
                                        { value: 'freepbx', label: 'FreePBX' },
                                        { value: 'vicidial', label: 'ViciDial' },
                                        { value: 'generic', label: 'Generic Asterisk' },
                                    ]}
                                    tooltip="Controls FreePBX-specific channel vars (AMPUSER/FROMEXTEN). ViciDial and generic skip them."
                                />
                                <FormInput
                                    label="Dial Context"
                                    value={env['AAVA_OUTBOUND_DIAL_CONTEXT'] || 'from-internal'}
                                    onChange={(e) => updateEnv('AAVA_OUTBOUND_DIAL_CONTEXT', e.target.value)}
                                    tooltip="Asterisk dialplan context for Local/ origination. FreePBX: from-internal, ViciDial: default."
                                />
                                <FormInput
                                    label="Dial Prefix"
                                    value={env['AAVA_OUTBOUND_DIAL_PREFIX'] || ''}
                                    onChange={(e) => updateEnv('AAVA_OUTBOUND_DIAL_PREFIX', e.target.value)}
                                    tooltip="Prefix prepended to phone number for carrier routing. ViciDial example: 911."
                                />
                                <FormSelect
                                    label="Channel Tech"
                                    value={env['AAVA_OUTBOUND_CHANNEL_TECH'] || 'auto'}
                                    onChange={(e) => updateEnv('AAVA_OUTBOUND_CHANNEL_TECH', e.target.value)}
                                    options={[
                                        { value: 'auto', label: 'Auto (PJSIP \u2192 SIP)' },
                                        { value: 'pjsip', label: 'PJSIP only' },
                                        { value: 'sip', label: 'SIP only (chan_sip)' },
                                        { value: 'local_only', label: 'Local only (no probing)' },
                                    ]}
                                    tooltip="Channel technology for internal extension probing. ViciDial uses SIP (chan_sip)."
                                />
                                <FormInput
                                    label="Media Directory"
                                    value={env['AAVA_MEDIA_DIR'] || '/mnt/asterisk_media/ai-generated'}
                                    onChange={(e) => updateEnv('AAVA_MEDIA_DIR', e.target.value)}
                                    tooltip="Directory for voicemail drop and consent prompts."
                                />
                                <FormInput
                                    label="Upload Max Bytes"
                                    type="number"
                                    value={env['AAVA_VM_UPLOAD_MAX_BYTES'] || '12582912'}
                                    onChange={(e) => updateEnv('AAVA_VM_UPLOAD_MAX_BYTES', e.target.value)}
                                    tooltip="Maximum upload size for recordings (default 12MB)."
                                />
                            </div>
                            <p className="text-xs text-muted-foreground mt-3">
                                <strong>Note:</strong> Outbound calling is managed from Admin UI → Call Scheduling.
                            </p>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Container Permissions */}
                    <ConfigSection title="Container Permissions" description="User/group IDs for container permission alignment.">
                        <ConfigCard>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <FormInput
                                    label="Asterisk UID"
                                    type="number"
                                    value={env['ASTERISK_UID'] || '995'}
                                    onChange={(e) => updateEnv('ASTERISK_UID', e.target.value)}
                                    tooltip="User ID of asterisk user on host (detect with: id -u asterisk)"
                                />
                                <FormInput
                                    label="Asterisk GID"
                                    type="number"
                                    value={env['ASTERISK_GID'] || '995'}
                                    onChange={(e) => updateEnv('ASTERISK_GID', e.target.value)}
                                    tooltip="Group ID of asterisk group on host (detect with: id -g asterisk)"
                                />
                                <FormInput
                                    label="Docker GID"
                                    type="number"
                                    value={env['DOCKER_GID'] || '999'}
                                    onChange={(e) => updateEnv('DOCKER_GID', e.target.value)}
                                    tooltip="Docker socket group ID (detect with: stat -c '%g' /var/run/docker.sock)"
                                />
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Docker Build Settings */}
                    <ConfigSection title="Docker Build Settings" description="Control which ML backends are included in the Local AI Server image.">
                        <ConfigCard>
                            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 mb-4">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                                    <div className="text-sm">
                                        <p className="font-medium text-amber-600 dark:text-amber-400">Build-time settings — require rebuild</p>
                                        <p className="text-muted-foreground mt-1">
                                            These settings control which packages are installed during <code className="px-1 py-0.5 bg-muted rounded text-xs">docker compose build</code>.
                                            After changing, run: <code className="px-1 py-0.5 bg-muted rounded text-xs">docker compose build --no-cache local_ai_server</code>
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-sm font-medium text-muted-foreground">STT Backends</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormSwitch
                                        id="include-vosk"
                                        label="Vosk"
                                        description="Lightweight offline STT (default, ~50MB)"
                                        checked={isTrue(env['INCLUDE_VOSK'] || 'true')}
                                        onChange={(e) => updateEnv('INCLUDE_VOSK', e.target.checked ? 'true' : 'false')}
                                    />
                                    <FormSwitch
                                        id="include-sherpa"
                                        label="Sherpa-ONNX"
                                        description="Fast streaming STT with ONNX runtime"
                                        checked={isTrue(env['INCLUDE_SHERPA'] || 'true')}
                                        onChange={(e) => updateEnv('INCLUDE_SHERPA', e.target.checked ? 'true' : 'false')}
                                    />
                                    <FormSwitch
                                        id="include-faster-whisper"
                                        label="Faster Whisper"
                                        description="High-accuracy Whisper (larger, GPU recommended)"
                                        checked={isTrue(env['INCLUDE_FASTER_WHISPER'])}
                                        onChange={(e) => updateEnv('INCLUDE_FASTER_WHISPER', e.target.checked ? 'true' : 'false')}
                                    />
                                </div>

                                <h4 className="text-sm font-medium text-muted-foreground pt-4">TTS Backends</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormSwitch
                                        id="include-piper"
                                        label="Piper"
                                        description="Fast local TTS (default, ~20MB)"
                                        checked={isTrue(env['INCLUDE_PIPER'] || 'true')}
                                        onChange={(e) => updateEnv('INCLUDE_PIPER', e.target.checked ? 'true' : 'false')}
                                    />
                                    <FormSwitch
                                        id="include-kokoro"
                                        label="Kokoro"
                                        description="Premium quality voices (~200MB)"
                                        checked={isTrue(env['INCLUDE_KOKORO'] || 'true')}
                                        onChange={(e) => updateEnv('INCLUDE_KOKORO', e.target.checked ? 'true' : 'false')}
                                    />
                                    <FormSwitch
                                        id="include-melotts"
                                        label="MeloTTS"
                                        description="CPU-optimized multilingual TTS (~500MB)"
                                        checked={isTrue(env['INCLUDE_MELOTTS'])}
                                        onChange={(e) => updateEnv('INCLUDE_MELOTTS', e.target.checked ? 'true' : 'false')}
                                    />
                                </div>

                                <h4 className="text-sm font-medium text-muted-foreground pt-4">LLM & Other</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormSwitch
                                        id="include-llama"
                                        label="llama.cpp"
                                        description="Local LLM inference (default)"
                                        checked={isTrue(env['INCLUDE_LLAMA'] || 'true')}
                                        onChange={(e) => updateEnv('INCLUDE_LLAMA', e.target.checked ? 'true' : 'false')}
                                    />
                                    <FormSwitch
                                        id="include-kroko"
                                        label="Kroko Embedded"
                                        description="Embedded Kroko ONNX server binary"
                                        checked={isTrue(env['INCLUDE_KROKO_EMBEDDED'])}
                                        onChange={(e) => updateEnv('INCLUDE_KROKO_EMBEDDED', e.target.checked ? 'true' : 'false')}
                                    />
                                </div>
                            </div>
                        </ConfigCard>
                    </ConfigSection>

                    {/* Other Variables */}
                    {otherSettings.length > 0 && (
                        <ConfigSection title="Other Variables" description="Additional environment variables found in .env file.">
                            <ConfigCard>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {otherSettings.map(key => (
                                        <FormInput
                                            key={key}
                                            label={key}
                                            value={env[key] || ''}
                                            onChange={(e) => updateEnv(key, e.target.value)}
                                        />
                                    ))}
                                </div>
                            </ConfigCard>
                        </ConfigSection>
                    )}
                </>
            )}
        </div>
    );
};

export default EnvPage;
