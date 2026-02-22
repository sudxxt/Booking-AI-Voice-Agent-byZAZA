import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { toast } from 'sonner';
import yaml from 'js-yaml';
import { Save, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { YamlErrorBanner, YamlErrorInfo } from '../../components/ui/YamlErrorBanner';
import { ConfigSection } from '../../components/ui/ConfigSection';
import { ConfigCard } from '../../components/ui/ConfigCard';
import { FormInput, FormSelect, FormSwitch } from '../../components/ui/FormComponents';
import { sanitizeConfigForSave } from '../../utils/configSanitizers';

const StreamingPage = () => {
    const { t } = useTranslation();
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
            toast.success(t('advanced.streaming.saveSuccess'));
        } catch (err) {
            console.error('Failed to save config', err);
            toast.error(t('advanced.streaming.saveFailed'));
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
                if (!force) {
                    const confirmForce = window.confirm(
                        `${response.data.message}\n\nDo you want to force restart anyway? This may disconnect active calls.`
                    );
                    if (confirmForce) {
                        await handleReloadAIEngine(true);
                    }
                    return;
                }
                toast.warning(response.data.message, { description: 'Force restart is still blocked.' });
                return;
            }

            if (response.data.status === 'degraded') {
                toast.warning('AI Engine restarted but may not be fully healthy', { description: response.data.output || 'Please verify manually' });
                return;
            }

            if (response.data.status === 'success') {
                setPendingRestart(false);
                toast.success(t('advanced.streaming.restartSuccess'));
            }
        } catch (error: any) {
            toast.error(t('modals.restartFailed'), { description: error.response?.data?.detail || error.message });
        } finally {
            setRestartingEngine(false);
        }
    };

    const updateStreamingConfig = (field: string, value: any) => {
        setConfig({
            ...config,
            streaming: {
                ...config.streaming,
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

    const streamingConfig = config.streaming || {};

    return (
        <div className="space-y-6">
            <div className={`${pendingRestart ? 'bg-orange-500/15 border-orange-500/30' : 'bg-yellow-500/10 border-yellow-500/20'} border text-yellow-600 dark:text-yellow-500 p-4 rounded-md flex items-center justify-between`}>
                <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {t('advanced.streaming.restartWarning')}
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
                    {restartingEngine ? t('advanced.streaming.restarting') : t('advanced.streaming.reloadAIEngine')}
                </button>
            </div>

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('advanced.streaming.title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {t('advanced.streaming.desc')}
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? t('advanced.streaming.saving') : t('advanced.streaming.saveChanges')}
                </button>
            </div>

            <ConfigSection title={t('advanced.streaming.playbackModeTitle')} description={t('advanced.streaming.playbackModeDesc')}>
                <ConfigCard>
                    <FormSelect
                        label={t('advanced.streaming.downstreamModeLabel')}
                        value={config.downstream_mode || 'stream'}
                        onChange={(e) => setConfig({ ...config, downstream_mode: e.target.value })}
                        options={[
                            { value: 'stream', label: t('advanced.streaming.downstreamModeStream') },
                            { value: 'file', label: t('advanced.streaming.downstreamModeFile') }
                        ]}
                        tooltip={t('advanced.streaming.downstreamModeTooltip')}
                    />
                </ConfigCard>
            </ConfigSection>

            <ConfigSection title={t('advanced.streaming.audioStreamParamsTitle')} description={t('advanced.streaming.audioStreamParamsDesc')}>
                <ConfigCard>
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('advanced.streaming.chunkSizeLabel')}
                                type="number"
                                value={streamingConfig.chunk_size_ms || 20}
                                onChange={(e) => updateStreamingConfig('chunk_size_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.chunkSizeTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.sampleRateLabel')}
                                type="number"
                                value={streamingConfig.sample_rate || 8000}
                                onChange={(e) => updateStreamingConfig('sample_rate', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.sampleRateTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.jitterBufferLabel')}
                                type="number"
                                value={streamingConfig.jitter_buffer_ms || 950}
                                onChange={(e) => updateStreamingConfig('jitter_buffer_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.jitterBufferTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.connTimeoutLabel')}
                                type="number"
                                value={streamingConfig.connection_timeout_ms || 120000}
                                onChange={(e) => updateStreamingConfig('connection_timeout_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.connTimeoutTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.keepaliveLabel')}
                                type="number"
                                value={streamingConfig.keepalive_interval_ms || 5000}
                                onChange={(e) => updateStreamingConfig('keepalive_interval_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.keepaliveTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.graceLabel')}
                                type="number"
                                value={streamingConfig.provider_grace_ms || 200}
                                onChange={(e) => updateStreamingConfig('provider_grace_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.graceTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.fallbackLabel')}
                                type="number"
                                value={streamingConfig.fallback_timeout_ms || 8000}
                                onChange={(e) => updateStreamingConfig('fallback_timeout_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.fallbackTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.lowWatermarkLabel')}
                                type="number"
                                value={streamingConfig.low_watermark_ms || 80}
                                onChange={(e) => updateStreamingConfig('low_watermark_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.lowWatermarkTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.minStartLabel')}
                                type="number"
                                value={streamingConfig.min_start_ms || 120}
                                onChange={(e) => updateStreamingConfig('min_start_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.minStartTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.greetMinStartLabel')}
                                type="number"
                                value={streamingConfig.greeting_min_start_ms || 40}
                                onChange={(e) => updateStreamingConfig('greeting_min_start_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.greetMinStartTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.greetRtpWaitLabel')}
                                type="number"
                                value={streamingConfig.greeting_rtp_wait_ms || 250}
                                onChange={(e) => updateStreamingConfig('greeting_rtp_wait_ms', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.greetRtpWaitTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.emptyBackoffLabel')}
                                type="number"
                                value={streamingConfig.empty_backoff_ticks_max || 5}
                                onChange={(e) => updateStreamingConfig('empty_backoff_ticks_max', parseInt(e.target.value))}
                                tooltip={t('advanced.streaming.emptyBackoffTooltip')}
                            />
                        </div>

                        <FormSwitch
                            label={t('advanced.streaming.contStreamLabel')}
                            description={t('advanced.streaming.contStreamDesc')}
                            checked={streamingConfig.continuous_stream ?? true}
                            onChange={(e) => updateStreamingConfig('continuous_stream', e.target.checked)}
                        />
                    </div>
                </ConfigCard>
            </ConfigSection>

            <ConfigSection title={t('advanced.streaming.normTitle')} description={t('advanced.streaming.normDesc')}>
                <ConfigCard>
                    <div className="space-y-6">
                        <FormSwitch
                            label={t('advanced.streaming.enableNormLabel')}
                            description={t('advanced.streaming.enableNormDesc')}
                            checked={streamingConfig.normalizer?.enabled ?? true}
                            onChange={(e) => updateStreamingConfig('normalizer', { ...streamingConfig.normalizer, enabled: e.target.checked })}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('advanced.streaming.maxGainLabel')}
                                type="number"
                                value={streamingConfig.normalizer?.max_gain_db || 18}
                                onChange={(e) => updateStreamingConfig('normalizer', { ...streamingConfig.normalizer, max_gain_db: parseInt(e.target.value) })}
                                disabled={!streamingConfig.normalizer?.enabled}
                                tooltip={t('advanced.streaming.maxGainTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.targetRmsLabel')}
                                type="number"
                                value={streamingConfig.normalizer?.target_rms || 1400}
                                onChange={(e) => updateStreamingConfig('normalizer', { ...streamingConfig.normalizer, target_rms: parseInt(e.target.value) })}
                                disabled={!streamingConfig.normalizer?.enabled}
                                tooltip={t('advanced.streaming.targetRmsTooltip')}
                            />
                        </div>
                    </div>
                </ConfigCard>
            </ConfigSection>

            <ConfigSection title={t('advanced.streaming.egressTitle')} description={t('advanced.streaming.egressDesc')}>
                <ConfigCard>
                    <div className="space-y-6">
                        <FormSelect
                            label={t('advanced.streaming.egressSwapLabel')}
                            value={streamingConfig.egress_swap_mode || 'auto'}
                            onChange={(e) => updateStreamingConfig('egress_swap_mode', e.target.value)}
                            options={[
                                { value: 'auto', label: t('advanced.streaming.swapModeAuto') },
                                { value: 'swap', label: t('advanced.streaming.swapModeSwap') },
                                { value: 'none', label: t('advanced.streaming.swapModeNone') }
                            ]}
                            tooltip={t('advanced.streaming.egressSwapTooltip')}
                        />
                        <FormSwitch
                            label={t('advanced.streaming.forceMulawLabel')}
                            description={t('advanced.streaming.forceMulawDesc')}
                            checked={streamingConfig.egress_force_mulaw ?? false}
                            onChange={(e) => updateStreamingConfig('egress_force_mulaw', e.target.checked)}
                            tooltip={t('advanced.streaming.forceMulawTooltip')}
                        />
                    </div>
                </ConfigCard>
            </ConfigSection>

            <ConfigSection title={t('advanced.streaming.diagTitle')} description={t('advanced.streaming.diagDesc')}>
                <ConfigCard>
                    <div className="space-y-6">
                        <FormSwitch
                            label={t('advanced.streaming.enableTapsLabel')}
                            description={t('advanced.streaming.enableTapsDesc')}
                            checked={streamingConfig.diag_enable_taps ?? false}
                            onChange={(e) => updateStreamingConfig('diag_enable_taps', e.target.checked)}
                        />
                        <FormInput
                            label={t('advanced.streaming.outDirLabel')}
                            value={streamingConfig.diag_out_dir || '/tmp/ai-engine-taps'}
                            onChange={(e) => updateStreamingConfig('diag_out_dir', e.target.value)}
                            disabled={!streamingConfig.diag_enable_taps}
                            tooltip={t('advanced.streaming.outDirTooltip')}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormInput
                                label={t('advanced.streaming.preSecsLabel')}
                                type="number"
                                value={streamingConfig.diag_pre_secs || 1}
                                onChange={(e) => updateStreamingConfig('diag_pre_secs', parseInt(e.target.value))}
                                disabled={!streamingConfig.diag_enable_taps}
                                tooltip={t('advanced.streaming.preSecsTooltip')}
                            />
                            <FormInput
                                label={t('advanced.streaming.postSecsLabel')}
                                type="number"
                                value={streamingConfig.diag_post_secs || 1}
                                onChange={(e) => updateStreamingConfig('diag_post_secs', parseInt(e.target.value))}
                                disabled={!streamingConfig.diag_enable_taps}
                                tooltip={t('advanced.streaming.postSecsTooltip')}
                            />
                        </div>
                    </div>
                </ConfigCard>
            </ConfigSection>
        </div>
    );
};

export default StreamingPage;
