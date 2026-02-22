import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import yaml from 'js-yaml';
import { Save, Zap, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { YamlErrorBanner, YamlErrorInfo } from '../../components/ui/YamlErrorBanner';
import { ConfigSection } from '../../components/ui/ConfigSection';
import { ConfigCard } from '../../components/ui/ConfigCard';
import { FormInput, FormSwitch } from '../../components/ui/FormComponents';
import { sanitizeConfigForSave } from '../../utils/configSanitizers';

const BargeInPage = () => {
    const { t } = useTranslation();
    const { confirm } = useConfirmDialog();
    const [config, setConfig] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [yamlError, setYamlError] = useState<YamlErrorInfo | null>(null);
    const [saving, setSaving] = useState(false);
    const [pendingRestart, setPendingRestart] = useState(false);
    const [restartingEngine, setRestartingEngine] = useState(false);

    useEffect(() => {
        fetchConfig();
    }, []);

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

    const handleSave = async () => {
        setSaving(true);
        try {
            const sanitized = sanitizeConfigForSave(config);
            await axios.post('/api/config/yaml', { content: yaml.dump(sanitized) });
            setPendingRestart(true);
            toast.success(t('advanced.bargeIn.saveSuccess'));
        } catch (err) {
            console.error('Failed to save config', err);
            toast.error(t('advanced.bargeIn.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const handleReloadAIEngine = async (force: boolean = false) => {
        setRestartingEngine(true);
        try {
            // Use restart to ensure all changes are picked up
            const response = await axios.post(`/api/system/containers/ai_engine/restart?force=${force}`);

            if (response.data.status === 'warning') {
                const confirmForce = await confirm({
                    title: t('advanced.bargeIn.forceRestartTitle'),
                    description: `${response.data.message}\n\n${t('advanced.bargeIn.forceRestartDesc')}`,
                    confirmText: t('advanced.bargeIn.forceRestartConfirm'),
                    variant: 'destructive'
                });
                if (confirmForce) {
                    await handleReloadAIEngine(true);
                }
                return;
            }

            if (response.data.status === 'degraded') {
                toast.warning(t('advanced.bargeIn.restartedDegradedWarn'), { description: response.data.output || t('advanced.bargeIn.restartedDegradedDesc') });
                return;
            }

            if (response.data.status === 'success') {
                setPendingRestart(false);
                toast.success(t('advanced.bargeIn.restartSuccess'));
            }
        } catch (error: any) {
            toast.error(t('modals.restartFailed') || 'Failed to restart AI Engine', { description: error.response?.data?.detail || error.message });
        } finally {
            setRestartingEngine(false);
        }
    };

    const updateBargeInConfig = (field: string, value: any) => {
        setConfig({
            ...config,
            barge_in: {
                ...config.barge_in,
                [field]: value
            }
        });
    };

    if (loading) return <div className="p-8 text-center text-muted-foreground">{t('common.loading')}</div>;

    if (yamlError) return (
        <div className="space-y-6">
            <YamlErrorBanner error={yamlError} />
        </div>
    );

    const bargeInConfig = config.barge_in || {};
    const providerFallbackProviders = Array.isArray(bargeInConfig.provider_fallback_providers)
        ? (bargeInConfig.provider_fallback_providers as string[]).filter(Boolean)
        : [];
    const providerFallbackProvidersStr = providerFallbackProviders.join(', ');

    return (
        <div className="space-y-6">
            <div className={`${pendingRestart ? 'bg-orange-500/15 border-orange-500/30' : 'bg-yellow-500/10 border-yellow-500/20'} border text-yellow-600 dark:text-yellow-500 p-4 rounded-md flex items-center justify-between`}>
                <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {t('advanced.bargeIn.restartWarning')}
                </div>
                <button
                    onClick={() => handleReloadAIEngine(false)}
                    disabled={restartingEngine}
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
                    {restartingEngine ? t('advanced.bargeIn.restarting') : t('advanced.bargeIn.reloadAIEngine')}
                </button>
            </div>

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('advanced.bargeIn.title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {t('advanced.bargeIn.desc')}
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? t('advanced.bargeIn.saving') : t('advanced.bargeIn.saveChanges')}
                </button>
            </div>

            <ConfigSection
                title={t('advanced.bargeIn.controlTitle')}
                description={t('advanced.bargeIn.controlDesc')}
            >
                <ConfigCard>
                    <div className="space-y-6">
                        <FormSwitch
                            label={t('advanced.bargeIn.enableLabel')}
                            description={t('advanced.bargeIn.enableDesc')}
                            tooltip={t('advanced.bargeIn.enableTooltip')}
                            checked={bargeInConfig.enabled ?? true}
                            onChange={(e) => updateBargeInConfig('enabled', e.target.checked)}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('advanced.bargeIn.energyThresholdLabel')}
                                type="number"
                                value={bargeInConfig.energy_threshold ?? 1000}
                                onChange={(e) => updateBargeInConfig('energy_threshold', parseInt(e.target.value))}
                                tooltip={t('advanced.bargeIn.energyThresholdTooltip')}
                            />
                            <FormInput
                                label={t('advanced.bargeIn.minDurationLabel')}
                                type="number"
                                value={bargeInConfig.min_ms ?? 250}
                                onChange={(e) => updateBargeInConfig('min_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.bargeIn.minDurationTooltip')}
                            />
                            <FormInput
                                label={t('advanced.bargeIn.cooldownLabel')}
                                type="number"
                                value={bargeInConfig.cooldown_ms ?? 500}
                                onChange={(e) => updateBargeInConfig('cooldown_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.bargeIn.cooldownTooltip')}
                            />
                            <FormInput
                                label={t('advanced.bargeIn.postTTSLabel')}
                                type="number"
                                value={bargeInConfig.post_tts_end_protection_ms ?? 250}
                                onChange={(e) => updateBargeInConfig('post_tts_end_protection_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.bargeIn.postTTSTooltip')}
                            />
                            <FormInput
                                label={t('advanced.bargeIn.outputSuppressLabel')}
                                type="number"
                                value={bargeInConfig.provider_output_suppress_ms ?? 1200}
                                onChange={(e) => updateBargeInConfig('provider_output_suppress_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.bargeIn.outputSuppressTooltip')}
                            />
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <div className="flex items-start">
                                <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
                                <div className="text-sm text-blue-700 dark:text-blue-300">
                                    <p className="font-medium mb-1">{t('advanced.bargeIn.tuningTipsTitle')}</p>
                                    <ul className="list-disc list-inside space-y-1">
                                        <li><strong>{t('advanced.bargeIn.energyThresholdLabel')}:</strong> {t('advanced.bargeIn.tuningTip1')}</li>
                                        <li><strong>{t('advanced.bargeIn.outputSuppressLabel')}:</strong> {t('advanced.bargeIn.tuningTip2')}</li>
                                        <li><strong>{t('advanced.bargeIn.postTTSLabel')}:</strong> {t('advanced.bargeIn.tuningTip3')}</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </ConfigCard>
            </ConfigSection>

            <ConfigSection
                title={t('advanced.bargeIn.advancedTitle')}
                description={t('advanced.bargeIn.advancedDesc')}
            >
                <ConfigCard>
                    <details className="space-y-4">
                        <summary className="cursor-pointer text-sm font-medium">{t('advanced.bargeIn.showAdvanced')}</summary>
                        <div className="space-y-8 pt-4">
                            <div className="space-y-4">
                                <div className="text-sm font-medium">{t('advanced.bargeIn.protectionWindows')}</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormInput
                                        label={t('advanced.bargeIn.initProtectLabel')}
                                        type="number"
                                        value={bargeInConfig.initial_protection_ms ?? 200}
                                        onChange={(e) => updateBargeInConfig('initial_protection_ms', parseInt(e.target.value))}
                                        tooltip={t('advanced.bargeIn.initProtectTooltip')}
                                    />
                                    <FormInput
                                        label={t('advanced.bargeIn.greetProtectLabel')}
                                        type="number"
                                        value={bargeInConfig.greeting_protection_ms ?? 0}
                                        onChange={(e) => updateBargeInConfig('greeting_protection_ms', parseInt(e.target.value))}
                                        tooltip={t('advanced.bargeIn.greetProtectTooltip')}
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="text-sm font-medium">{t('advanced.bargeIn.providerOwnedMode')}</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormSwitch
                                        label={t('advanced.bargeIn.providerFallbackLabel')}
                                        description={t('advanced.bargeIn.providerFallbackDesc')}
                                        tooltip={t('advanced.bargeIn.providerFallbackTooltip')}
                                        checked={bargeInConfig.provider_fallback_enabled ?? true}
                                        onChange={(e) => updateBargeInConfig('provider_fallback_enabled', e.target.checked)}
                                    />
                                    <FormInput
                                        label={t('advanced.bargeIn.providerFallbackProvidersLabel')}
                                        type="text"
                                        value={providerFallbackProvidersStr}
                                        onChange={(e) =>
                                            updateBargeInConfig(
                                                'provider_fallback_providers',
                                                (e.target.value || '')
                                                    .split(',')
                                                    .map((s) => s.trim())
                                                    .filter(Boolean)
                                            )
                                        }
                                        tooltip={t('advanced.bargeIn.providerFallbackProvidersTooltip')}
                                    />
                                    <FormInput
                                        label={t('advanced.bargeIn.suppressExtendLabel')}
                                        type="number"
                                        value={bargeInConfig.provider_output_suppress_extend_ms ?? 600}
                                        onChange={(e) => updateBargeInConfig('provider_output_suppress_extend_ms', parseInt(e.target.value))}
                                        tooltip={t('advanced.bargeIn.suppressExtendTooltip')}
                                    />
                                    <FormInput
                                        label={t('advanced.bargeIn.chunkExtendLabel')}
                                        type="number"
                                        value={bargeInConfig.provider_output_suppress_chunk_extend_ms ?? 250}
                                        onChange={(e) => updateBargeInConfig('provider_output_suppress_chunk_extend_ms', parseInt(e.target.value))}
                                        tooltip={t('advanced.bargeIn.chunkExtendTooltip')}
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="text-sm font-medium">{t('advanced.bargeIn.pipelineMode')}</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormSwitch
                                        label={t('advanced.bargeIn.talkDetectLabel')}
                                        description={t('advanced.bargeIn.talkDetectDesc')}
                                        tooltip={t('advanced.bargeIn.talkDetectTooltip')}
                                        checked={bargeInConfig.pipeline_talk_detect_enabled ?? true}
                                        onChange={(e) => updateBargeInConfig('pipeline_talk_detect_enabled', e.target.checked)}
                                    />
                                    <FormInput
                                        label={t('advanced.bargeIn.pipelineMinLabel')}
                                        type="number"
                                        value={bargeInConfig.pipeline_min_ms ?? 120}
                                        onChange={(e) => updateBargeInConfig('pipeline_min_ms', parseInt(e.target.value))}
                                        tooltip={t('advanced.bargeIn.pipelineMinTooltip')}
                                    />
                                    <FormInput
                                        label={t('advanced.bargeIn.pipelineEnergyLabel')}
                                        type="number"
                                        value={bargeInConfig.pipeline_energy_threshold ?? 300}
                                        onChange={(e) => updateBargeInConfig('pipeline_energy_threshold', parseInt(e.target.value))}
                                        tooltip={t('advanced.bargeIn.pipelineEnergyTooltip')}
                                    />
                                    <FormInput
                                        label={t('advanced.bargeIn.talkDetectSilenceLabel')}
                                        type="number"
                                        value={bargeInConfig.pipeline_talk_detect_silence_ms ?? 1200}
                                        onChange={(e) => updateBargeInConfig('pipeline_talk_detect_silence_ms', parseInt(e.target.value))}
                                        tooltip={t('advanced.bargeIn.talkDetectSilenceTooltip')}
                                    />
                                    <FormInput
                                        label={t('advanced.bargeIn.talkDetectTalkingLabel')}
                                        type="number"
                                        value={bargeInConfig.pipeline_talk_detect_talking_threshold ?? 128}
                                        onChange={(e) => updateBargeInConfig('pipeline_talk_detect_talking_threshold', parseInt(e.target.value))}
                                        tooltip={t('advanced.bargeIn.talkDetectTalkingTooltip')}
                                    />
                                </div>
                            </div>
                        </div>
                    </details>
                </ConfigCard>
            </ConfigSection>

            <ConfigSection
                title={t('advanced.bargeIn.currentConfigTitle')}
                description={t('advanced.bargeIn.currentConfigDesc')}
            >
                <ConfigCard>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-muted-foreground">{t('advanced.bargeIn.status')}:</span>
                            <span className={`ml-2 font-medium ${bargeInConfig.enabled ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {bargeInConfig.enabled ? t('advanced.bargeIn.enabled') : t('advanced.bargeIn.disabled')}
                            </span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">{t('advanced.bargeIn.energyThresholdLabel')}:</span>
                            <span className="ml-2 font-medium">{bargeInConfig.energy_threshold ?? 1000} RMS</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">{t('advanced.bargeIn.minDurationLabel')}:</span>
                            <span className="ml-2 font-medium">{bargeInConfig.min_ms ?? 250}ms</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">{t('advanced.bargeIn.postTTSLabel')}:</span>
                            <span className="ml-2 font-medium">{bargeInConfig.post_tts_end_protection_ms ?? 250}ms</span>
                        </div>
                    </div>
                </ConfigCard>
            </ConfigSection>
        </div>
    );
};

export default BargeInPage;
