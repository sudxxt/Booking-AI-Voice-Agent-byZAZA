import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { toast } from 'sonner';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import yaml from 'js-yaml';
import { Save, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { YamlErrorBanner, YamlErrorInfo } from '../../components/ui/YamlErrorBanner';
import { ConfigSection } from '../../components/ui/ConfigSection';
import { ConfigCard } from '../../components/ui/ConfigCard';
import { FormInput, FormSwitch } from '../../components/ui/FormComponents';
import { sanitizeConfigForSave } from '../../utils/configSanitizers';

const VAD_UTTERANCE_EXPERT_STORAGE_KEY = 'aava.ui.vad.utteranceExpert';

const VADPage = () => {
    const { t } = useTranslation();
    const { confirm } = useConfirmDialog();
    const [config, setConfig] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [yamlError, setYamlError] = useState<YamlErrorInfo | null>(null);
    const [saving, setSaving] = useState(false);
    const [pendingRestart, setPendingRestart] = useState(false);
    const [restartingEngine, setRestartingEngine] = useState(false);
    const [showUtteranceExpert, setShowUtteranceExpert] = useState<boolean>(() => {
        try {
            const v = localStorage.getItem(VAD_UTTERANCE_EXPERT_STORAGE_KEY);
            if (v === 'true') return true;
            if (v === 'false') return false;
        } catch {
            // Ignore storage failures.
        }
        return false;
    });

    useEffect(() => {
        try {
            localStorage.setItem(VAD_UTTERANCE_EXPERT_STORAGE_KEY, showUtteranceExpert ? 'true' : 'false');
        } catch {
            // Ignore.
        }
    }, [showUtteranceExpert]);

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
            toast.success(t('advanced.vad.saveSuccess'));
        } catch (err) {
            console.error('Failed to save config', err);
            toast.error(t('advanced.vad.saveFailed'));
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
                    title: t('advanced.vad.forceRestartTitle'),
                    description: `${response.data.message}\n\n${t('advanced.vad.forceRestartDesc')}`,
                    confirmText: t('advanced.vad.forceRestartConfirm'),
                    variant: 'destructive'
                });
                if (confirmForce) {
                    setRestartingEngine(false);
                    return handleReloadAIEngine(true);
                }
                return;
            }

            if (response.data.status === 'degraded') {
                toast.warning(t('advanced.vad.restartedDegradedWarn'), { description: response.data.output || t('advanced.vad.restartedDegradedDesc') });
                return;
            }

            if (response.data.status === 'success') {
                setPendingRestart(false);
                toast.success(t('advanced.vad.restartSuccess'));
            }
        } catch (error: any) {
            toast.error(t('modals.restartFailed') || 'Failed to restart AI Engine', { description: error.response?.data?.detail || error.message });
        } finally {
            setRestartingEngine(false);
        }
    };

    const updateVADConfig = (field: string, value: any) => {
        setConfig({
            ...config,
            vad: {
                ...config.vad,
                [field]: value
            }
        });
    };

    useEffect(() => {
        const vad = config?.vad || {};
        const hasExpertOverrides = [
            'min_utterance_duration_ms',
            'max_utterance_duration_ms',
            'utterance_padding_ms',
            'fallback_buffer_size',
        ].some((field) => vad[field] !== undefined);
        if (hasExpertOverrides) {
            setShowUtteranceExpert(true);
        }
    }, [config?.vad]);

    if (loading) return <div className="p-8 text-center text-muted-foreground">{t('common.loading')}</div>;

    if (yamlError) return (
        <div className="space-y-6">
            <YamlErrorBanner error={yamlError} />
        </div>
    );

    const vadConfig = config.vad || {};

    return (
        <div className="space-y-6">
            <div className={`${pendingRestart ? 'bg-orange-500/15 border-orange-500/30' : 'bg-yellow-500/10 border-yellow-500/20'} border text-yellow-600 dark:text-yellow-500 p-4 rounded-md flex items-center justify-between`}>
                <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {t('advanced.vad.restartWarning')}
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
                    {restartingEngine ? t('advanced.vad.restarting') : t('advanced.vad.reloadAIEngine')}
                </button>
            </div>

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('advanced.vad.title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {t('advanced.vad.desc')}
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? t('advanced.vad.saving') : t('advanced.vad.saveChanges')}
                </button>
            </div>

            <ConfigSection title={t('advanced.vad.primaryDetectTitle')} description={t('advanced.vad.primaryDetectDesc')}>
                <ConfigCard>
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormSwitch
                                label={t('advanced.vad.enhVadLabel')}
                                description={t('advanced.vad.enhVadDesc')}
                                tooltip={t('advanced.vad.enhVadTooltip')}
                                checked={vadConfig.enhanced_enabled ?? false}
                                onChange={(e) => updateVADConfig('enhanced_enabled', e.target.checked)}
                            />
                            <FormSwitch
                                label={t('advanced.vad.useProvVadLabel')}
                                description={t('advanced.vad.useProvVadDesc')}
                                tooltip={t('advanced.vad.useProvVadTooltip')}
                                checked={vadConfig.use_provider_vad ?? false}
                                onChange={(e) => updateVADConfig('use_provider_vad', e.target.checked)}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('advanced.vad.energyThreshLabel')}
                                type="number"
                                value={vadConfig.energy_threshold ?? 1500}
                                onChange={(e) => updateVADConfig('energy_threshold', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.energyThreshTooltip')}
                                disabled={!vadConfig.enhanced_enabled}
                            />
                            <FormInput
                                label={t('advanced.vad.confThreshLabel')}
                                type="number"
                                step="0.05"
                                min="0"
                                max="1"
                                value={vadConfig.confidence_threshold ?? 0.6}
                                onChange={(e) => updateVADConfig('confidence_threshold', parseFloat(e.target.value))}
                                tooltip={t('advanced.vad.confThreshTooltip')}
                                disabled={!vadConfig.enhanced_enabled}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormSwitch
                                label={t('advanced.vad.adaptThreshLabel')}
                                description={t('advanced.vad.adaptThreshDesc')}
                                tooltip={t('advanced.vad.adaptThreshTooltip')}
                                checked={vadConfig.adaptive_threshold_enabled ?? true}
                                onChange={(e) => updateVADConfig('adaptive_threshold_enabled', e.target.checked)}
                            />
                            <FormInput
                                label={t('advanced.vad.noiseAdaptRateLabel')}
                                type="number"
                                step="0.05"
                                min="0"
                                max="1"
                                value={vadConfig.noise_adaptation_rate ?? 0.1}
                                onChange={(e) => updateVADConfig('noise_adaptation_rate', parseFloat(e.target.value))}
                                tooltip={t('advanced.vad.noiseAdaptRateTooltip')}
                            />
                        </div>
                    </div>
                </ConfigCard>
            </ConfigSection>

            <ConfigSection title={t('advanced.vad.engineVadTitle')} description={t('advanced.vad.engineVadDesc')}>
                <ConfigCard>
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormSwitch
                                label={t('advanced.vad.enableEngineFallbackLabel')}
                                description={t('advanced.vad.enableEngineFallbackDesc')}
                                tooltip={t('advanced.vad.enableEngineFallbackTooltip')}
                                checked={vadConfig.fallback_enabled ?? true}
                                onChange={(e) => updateVADConfig('fallback_enabled', e.target.checked)}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('advanced.vad.fallbackIntervalLabel')}
                                type="number"
                                value={vadConfig.fallback_interval_ms ?? 1500}
                                onChange={(e) => updateVADConfig('fallback_interval_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.fallbackIntervalTooltip')}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FormInput
                                label={t('advanced.vad.aggressivenessLabel')}
                                type="number"
                                min="0"
                                max="3"
                                value={vadConfig.webrtc_aggressiveness ?? 1}
                                onChange={(e) => updateVADConfig('webrtc_aggressiveness', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.aggressivenessTooltip')}
                            />
                            <FormInput
                                label={t('advanced.vad.startFramesLabel')}
                                type="number"
                                value={vadConfig.webrtc_start_frames ?? 2}
                                onChange={(e) => updateVADConfig('webrtc_start_frames', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.startFramesTooltip')}
                            />
                            <FormInput
                                label={t('advanced.vad.endSilFramesLabel')}
                                type="number"
                                value={vadConfig.webrtc_end_silence_frames ?? 15}
                                onChange={(e) => updateVADConfig('webrtc_end_silence_frames', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.endSilFramesTooltip')}
                            />
                        </div>
                    </div>
                </ConfigCard>
            </ConfigSection>

            <ConfigSection
                title={t('advanced.vad.utteranceTitle')}
                description={t('advanced.vad.utteranceDesc')}
            >
                <ConfigCard>
                    <div className="space-y-6">
                        <div className="border border-amber-300/40 rounded-lg p-3 bg-amber-500/5">
                            <FormSwitch
                                label={t('advanced.vad.uttExpertLabel')}
                                description={t('advanced.vad.uttExpertDesc')}
                                checked={showUtteranceExpert}
                                onChange={(e) => setShowUtteranceExpert(e.target.checked)}
                                className="mb-0 border-0 p-0 bg-transparent"
                            />
                            <p className={`text-xs mt-2 ${showUtteranceExpert ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                {showUtteranceExpert
                                    ? t('advanced.vad.uttExpertWarn')
                                    : t('advanced.vad.uttExpertReadOnly')}
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('advanced.vad.minUttDurationLabel')}
                                type="number"
                                value={vadConfig.min_utterance_duration_ms ?? 800}
                                onChange={(e) => updateVADConfig('min_utterance_duration_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.minUttDurationTooltip')}
                                disabled={!showUtteranceExpert}
                            />
                            <FormInput
                                label={t('advanced.vad.maxUttDurationLabel')}
                                type="number"
                                value={vadConfig.max_utterance_duration_ms ?? 8000}
                                onChange={(e) => updateVADConfig('max_utterance_duration_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.maxUttDurationTooltip')}
                                disabled={!showUtteranceExpert}
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('advanced.vad.uttPadLabel')}
                                type="number"
                                value={vadConfig.utterance_padding_ms ?? 100}
                                onChange={(e) => updateVADConfig('utterance_padding_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.uttPadTooltip')}
                                disabled={!showUtteranceExpert}
                            />
                            <FormInput
                                label={t('advanced.vad.fallbackBufLabel')}
                                type="number"
                                value={vadConfig.fallback_buffer_size ?? 128000}
                                onChange={(e) => updateVADConfig('fallback_buffer_size', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.fallbackBufTooltip')}
                                disabled={!showUtteranceExpert}
                            />
                        </div>
                    </div>
                </ConfigCard>
            </ConfigSection>

            <ConfigSection
                title={t('advanced.vad.upstreamSquelchTitle')}
                description={t('advanced.vad.upstreamSquelchDesc')}
            >
                <ConfigCard>
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormSwitch
                                label={t('advanced.vad.enableUpsqLabel')}
                                description={t('advanced.vad.enableUpsqDesc')}
                                tooltip={t('advanced.vad.enableUpsqTooltip')}
                                checked={vadConfig.upstream_squelch_enabled ?? true}
                                onChange={(e) => updateVADConfig('upstream_squelch_enabled', e.target.checked)}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('advanced.vad.baseRmsLabel')}
                                type="number"
                                min="0"
                                value={vadConfig.upstream_squelch_base_rms ?? 200}
                                onChange={(e) => updateVADConfig('upstream_squelch_base_rms', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.baseRmsTooltip')}
                            />
                            <FormInput
                                label={t('advanced.vad.noiseFactorLabel')}
                                type="number"
                                step="0.1"
                                min="0"
                                value={vadConfig.upstream_squelch_noise_factor ?? 2.5}
                                onChange={(e) => updateVADConfig('upstream_squelch_noise_factor', parseFloat(e.target.value))}
                                tooltip={t('advanced.vad.noiseFactorTooltip')}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('advanced.vad.noiseEmaAlphaLabel')}
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
                                value={vadConfig.upstream_squelch_noise_ema_alpha ?? 0.06}
                                onChange={(e) => updateVADConfig('upstream_squelch_noise_ema_alpha', parseFloat(e.target.value))}
                                tooltip={t('advanced.vad.noiseEmaAlphaTooltip')}
                            />
                            <FormInput
                                label={t('advanced.vad.minSpeechFramesLabel')}
                                type="number"
                                min="1"
                                value={vadConfig.upstream_squelch_min_speech_frames ?? 2}
                                onChange={(e) => updateVADConfig('upstream_squelch_min_speech_frames', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.minSpeechFramesTooltip')}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('advanced.vad.upsqEndSilFramesLabel')}
                                type="number"
                                min="1"
                                value={vadConfig.upstream_squelch_end_silence_frames ?? 15}
                                onChange={(e) => updateVADConfig('upstream_squelch_end_silence_frames', parseInt(e.target.value))}
                                tooltip={t('advanced.vad.upsqEndSilFramesTooltip')}
                            />
                        </div>
                    </div>
                </ConfigCard>
            </ConfigSection>
        </div>
    );
};

export default VADPage;
