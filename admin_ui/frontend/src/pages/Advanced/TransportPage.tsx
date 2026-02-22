import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { toast } from 'sonner';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import yaml from 'js-yaml';
import { Save, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { YamlErrorBanner, YamlErrorInfo } from '../../components/ui/YamlErrorBanner';
import { ConfigSection } from '../../components/ui/ConfigSection';
import { ConfigCard } from '../../components/ui/ConfigCard';
import { FormInput, FormSelect, FormSwitch } from '../../components/ui/FormComponents';
import { sanitizeConfigForSave } from '../../utils/configSanitizers';

const TransportPage = () => {
    const { t } = useTranslation();
    const { confirm } = useConfirmDialog();
    const [config, setConfig] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [yamlError, setYamlError] = useState<YamlErrorInfo | null>(null);
    const [saving, setSaving] = useState(false);
    const [pendingRestart, setPendingRestart] = useState(false);
    const [restartingEngine, setRestartingEngine] = useState(false);
    const [applyMethod, setApplyMethod] = useState<string>('restart');
    const [showExternalMediaExpert, setShowExternalMediaExpert] = useState(false);

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
            const response = await axios.post('/api/config/yaml', { content: yaml.dump(sanitized) });
            const method = response.data?.recommended_apply_method || 'restart';
            setApplyMethod(method);
            setPendingRestart(true);

            // Show appropriate message based on recommended apply method
            if (method === 'hot_reload') {
                toast.success(t('advanced.transport.saveSuccessHotReload'));
            } else {
                toast.success(t('advanced.transport.saveSuccessRestart'));
            }
        } catch (err) {
            console.error('Failed to save config', err);
            toast.error(t('advanced.transport.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const handleApplyAIEngine = async (force: boolean = false) => {
        setRestartingEngine(true);
        try {
            if (applyMethod === 'hot_reload') {
                const response = await axios.post('/api/system/containers/ai_engine/reload');

                if (response.data?.restart_required) {
                    setApplyMethod('restart');
                    setPendingRestart(true);
                    toast.warning(t('advanced.transport.hotReloadPartial'), { description: response.data.message || t('advanced.transport.hotReloadPartialDesc') });
                    return;
                }

                if (response.data?.status === 'success') {
                    setPendingRestart(false);
                    toast.success(t('advanced.transport.hotReloadSuccess'));
                    return;
                }

                toast.info(`${t('advanced.transport.hotReloadResponse')}: ${response.data?.message || t('common.unknownStatus')}`);
                return;
            }

            const response = await axios.post(`/api/system/containers/ai_engine/restart?force=${force}`);

            if (response.data.status === 'warning') {
                const confirmForce = await confirm({
                    title: t('modals.forceRestart'),
                    description: `${response.data.message}\n\n${t('modals.forceRestartDesc')}`,
                    confirmText: t('modals.forceRestart'),
                    variant: 'destructive'
                });
                if (confirmForce) {
                    setRestartingEngine(false);
                    return handleApplyAIEngine(true);
                }
                return;
            }

            if (response.data.status === 'degraded') {
                toast.warning(t('advanced.transport.restartDegraded'), { description: response.data.output || t('advanced.transport.verifyManually') });
                return;
            }

            if (response.data.status === 'success') {
                setPendingRestart(false);
                toast.success(t('advanced.transport.restartSuccess'));
                return;
            }
        } catch (error: any) {
            const actionLabel = applyMethod === 'hot_reload' ? t('advanced.transport.hotReloadAction') : t('advanced.transport.restartAction');
            toast.error(t('advanced.transport.actionFailed', { action: actionLabel }), { description: error.response?.data?.detail || error.message });
        } finally {
            setRestartingEngine(false);
        }
    };

    const updateConfig = (field: string, value: any) => {
        setConfig({ ...config, [field]: value });
    };

    const updateSectionConfig = (section: string, field: string, value: any) => {
        setConfig({
            ...config,
            [section]: {
                ...config[section],
                [field]: value
            }
        });
    };

    useEffect(() => {
        if (config?.external_media?.lock_remote_endpoint !== undefined) {
            setShowExternalMediaExpert(true);
        }
    }, [config?.external_media?.lock_remote_endpoint]);

    if (loading) return <div className="p-8 text-center text-muted-foreground">{t('common.loading')}</div>;

    if (yamlError) return (
        <div className="space-y-6">
            <YamlErrorBanner error={yamlError} />
        </div>
    );

    const transportType = config.audio_transport || 'audiosocket';
    const audiosocketConfig = config.audiosocket || {};
    const externalMediaConfig = config.external_media || {};

    // Determine banner message based on apply method
    const bannerMessage = applyMethod === 'hot_reload'
        ? t('advanced.transport.hotReloadBanner')
        : t('advanced.transport.restartBanner');

    const buttonLabel = applyMethod === 'hot_reload' ? t('advanced.transport.applyChangesBtn') : t('advanced.transport.restartBtn');

    return (
        <div className="space-y-6">
            <div className={`${pendingRestart ? 'bg-orange-500/15 border-orange-500/30' : 'bg-yellow-500/10 border-yellow-500/20'} border text-yellow-600 dark:text-yellow-500 p-4 rounded-md flex items-center justify-between`}>
                <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {bannerMessage}
                </div>
                <button
                    onClick={() => handleApplyAIEngine(false)}
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
                    {restartingEngine ? t('advanced.transport.applying') : buttonLabel}
                </button>
            </div>

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('advanced.transport.title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {t('advanced.transport.desc')}
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? t('advanced.transport.saving') : t('advanced.transport.saveChanges')}
                </button>
            </div>

            <ConfigSection title={t('advanced.transport.asteriskTitle')} description={t('advanced.transport.asteriskDesc')}>
                <ConfigCard>
                    <FormInput
                        label={t('advanced.transport.stasisAppName')}
                        value={config.asterisk?.app_name || 'asterisk-ai-voice-agent'}
                        onChange={(e) => updateSectionConfig('asterisk', 'app_name', e.target.value)}
                        tooltip={t('advanced.transport.stasisAppTooltip')}
                    />
                </ConfigCard>
            </ConfigSection>

            <ConfigSection title={t('advanced.transport.typeTitle')} description={t('advanced.transport.typeDesc')}>
                <ConfigCard>
                    <FormSelect
                        label={t('advanced.transport.methodLabel')}
                        value={transportType}
                        onChange={(e) => updateConfig('audio_transport', e.target.value)}
                        options={[
                            { value: 'audiosocket', label: t('advanced.transport.methodAudioSocket') },
                            { value: 'externalmedia', label: t('advanced.transport.methodRTP') }
                        ]}
                        tooltip={t('advanced.transport.methodTooltip')}
                    />
                </ConfigCard>
            </ConfigSection>

            {transportType === 'audiosocket' && (
                <ConfigSection title={t('advanced.transport.asTitle')} description={t('advanced.transport.asDesc')}>
                    <ConfigCard>
                        <div className="space-y-6">
                            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('advanced.transport.netConfig')}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label={t('advanced.transport.bindHost')}
                                    value={audiosocketConfig.host || '127.0.0.1'}
                                    onChange={(e) => updateSectionConfig('audiosocket', 'host', e.target.value)}
                                    tooltip={t('advanced.transport.bindHostTooltip')}
                                />
                                <FormInput
                                    label={t('advanced.transport.advertiseHost')}
                                    value={audiosocketConfig.advertise_host || audiosocketConfig.host || '127.0.0.1'}
                                    onChange={(e) => updateSectionConfig('audiosocket', 'advertise_host', e.target.value)}
                                    tooltip={t('advanced.transport.advertiseHostTooltip')}
                                />
                                <FormInput
                                    label={t('advanced.transport.port')}
                                    type="number"
                                    value={audiosocketConfig.port || 8090}
                                    onChange={(e) => updateSectionConfig('audiosocket', 'port', parseInt(e.target.value))}
                                    tooltip={t('advanced.transport.portTooltip')}
                                />
                                <FormInput
                                    label={t('advanced.transport.format')}
                                    value={audiosocketConfig.format || 'slin'}
                                    onChange={(e) => updateSectionConfig('audiosocket', 'format', e.target.value)}
                                    tooltip={t('advanced.transport.formatTooltip')}
                                />
                            </div>
                        </div>
                    </ConfigCard>
                </ConfigSection>
            )}

            {transportType === 'externalmedia' && (
                <ConfigSection title={t('advanced.transport.rtpTitle')} description={t('advanced.transport.rtpDesc')}>
                    <ConfigCard>
                        <div className="space-y-6">
                            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('advanced.transport.netConfig')}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput
                                    label={t('advanced.transport.rtpBindHost')}
                                    value={externalMediaConfig.rtp_host || '127.0.0.1'}
                                    onChange={(e) => updateSectionConfig('external_media', 'rtp_host', e.target.value)}
                                    tooltip={t('advanced.transport.rtpBindHostTooltip')}
                                />
                                <FormInput
                                    label={t('advanced.transport.advertiseHost')}
                                    value={externalMediaConfig.advertise_host || externalMediaConfig.rtp_host || '127.0.0.1'}
                                    onChange={(e) => updateSectionConfig('external_media', 'advertise_host', e.target.value)}
                                    tooltip={t('advanced.transport.rtpAdvertiseHostTooltip')}
                                />
                                <FormInput
                                    label={t('advanced.transport.rtpPort')}
                                    type="number"
                                    value={externalMediaConfig.rtp_port || 18080}
                                    onChange={(e) => updateSectionConfig('external_media', 'rtp_port', parseInt(e.target.value))}
                                    tooltip={t('advanced.transport.rtpPortTooltip')}
                                />
                                <FormInput
                                    label={t('advanced.transport.portRange')}
                                    value={externalMediaConfig.port_range || '18080:18099'}
                                    onChange={(e) => updateSectionConfig('external_media', 'port_range', e.target.value)}
                                    placeholder="18080:18099"
                                    tooltip={t('advanced.transport.portRangeTooltip')}
                                />
                                <FormInput
                                    label={t('advanced.transport.allowedHosts')}
                                    value={Array.isArray(externalMediaConfig.allowed_remote_hosts)
                                        ? externalMediaConfig.allowed_remote_hosts.join(', ')
                                        : (externalMediaConfig.allowed_remote_hosts || '')}
                                    onChange={(e) => {
                                        const value = e.target.value.trim();
                                        const hosts = value ? value.split(',').map(h => h.trim()).filter(h => h) : [];
                                        updateSectionConfig('external_media', 'allowed_remote_hosts', hosts.length > 0 ? hosts : null);
                                    }}
                                    placeholder={t('advanced.transport.allowedHostsPlaceholder')}
                                    tooltip={t('advanced.transport.allowedHostsTooltip')}
                                />
                            </div>

                            <div className="border-t border-border my-4"></div>

                            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('advanced.transport.asteriskSideConfig')}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormSelect
                                    label={t('advanced.transport.codec')}
                                    value={externalMediaConfig.codec || 'ulaw'}
                                    onChange={(e) => updateSectionConfig('external_media', 'codec', e.target.value)}
                                    options={[
                                        { value: 'ulaw', label: 'μ-law (8kHz)' },
                                        { value: 'alaw', label: 'A-law (8kHz)' },
                                        { value: 'slin', label: 'SLIN (8kHz)' },
                                        { value: 'slin16', label: 'SLIN16 (16kHz)' }
                                    ]}
                                    tooltip={t('advanced.transport.codecDesc')}
                                />
                                <FormSelect
                                    label={t('advanced.transport.direction')}
                                    value={externalMediaConfig.direction || 'both'}
                                    onChange={(e) => updateSectionConfig('external_media', 'direction', e.target.value)}
                                    options={[
                                        { value: 'both', label: t('advanced.transport.dirBoth') },
                                        { value: 'sendonly', label: t('advanced.transport.dirSend') },
                                        { value: 'recvonly', label: t('advanced.transport.dirRecv') }
                                    ]}
                                />
                            </div>

                            <div className="border-t border-border my-4"></div>

                            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('advanced.transport.engineSideConfig')}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormSelect
                                    label={t('advanced.transport.internalFormat')}
                                    value={externalMediaConfig.format || 'slin16'}
                                    onChange={(e) => updateSectionConfig('external_media', 'format', e.target.value)}
                                    options={[
                                        { value: 'slin', label: 'SLIN (8kHz)' },
                                        { value: 'slin16', label: 'SLIN16 (16kHz)' },
                                        { value: 'ulaw', label: 'μ-law (8kHz)' }
                                    ]}
                                    tooltip={t('advanced.transport.internalFormatDesc')}
                                />
                                <FormInput
                                    label={t('advanced.transport.sampleRate')}
                                    type="number"
                                    value={externalMediaConfig.sample_rate || 16000}
                                    onChange={(e) => updateSectionConfig('external_media', 'sample_rate', parseInt(e.target.value))}
                                    tooltip={t('advanced.transport.sampleRateTooltip')}
                                />
                            </div>

                            <div className="border border-amber-300/40 rounded-lg p-4 bg-amber-500/5">
                                <FormSwitch
                                    label={t('advanced.transport.expertSettings')}
                                    description={t('advanced.transport.expertDesc')}
                                    checked={showExternalMediaExpert}
                                    onChange={(e) => setShowExternalMediaExpert(e.target.checked)}
                                    className="mb-0 border-0 p-0 bg-transparent"
                                />
                                <p className={`text-xs mt-2 ${showExternalMediaExpert ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                    {showExternalMediaExpert
                                        ? t('advanced.transport.expertWarning')
                                        : t('advanced.transport.expertInfo')}
                                </p>
                                <div className="mt-3">
                                    <FormSwitch
                                        label={t('advanced.transport.lockEndpoint')}
                                        description={t('advanced.transport.lockEndpointDesc')}
                                        checked={externalMediaConfig.lock_remote_endpoint ?? true}
                                        onChange={(e) => updateSectionConfig('external_media', 'lock_remote_endpoint', e.target.checked)}
                                        disabled={!showExternalMediaExpert}
                                    />
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {t('advanced.transport.lockEndpointSec')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </ConfigCard>
                </ConfigSection>
            )}
        </div>
    );
};

export default TransportPage;
