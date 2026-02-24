import React from 'react';
import { useTranslation } from 'react-i18next';
import HelpTooltip from '../ui/HelpTooltip';

interface VADConfigProps {
    config: any;
    onChange: (newConfig: any) => void;
}

const VADConfig: React.FC<VADConfigProps> = ({ config, onChange }) => {
    const { t } = useTranslation();
    const handleChange = (field: string, value: any) => {
        onChange({ ...config, [field]: value });
    };

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Voice Activity Detection</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="enhanced_enabled"
                                className="rounded border-input"
                                checked={config.enhanced_enabled ?? true}
                                onChange={(e) => handleChange('enhanced_enabled', e.target.checked)}
                            />
                            <label htmlFor="enhanced_enabled" className="text-sm font-medium">Enhanced VAD</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.enhancedVad')} />
                        </div>
                    </div>

                    <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="use_provider_vad"
                                className="rounded border-input"
                                checked={config.use_provider_vad ?? false}
                                onChange={(e) => handleChange('use_provider_vad', e.target.checked)}
                            />
                            <label htmlFor="use_provider_vad" className="text-sm font-medium">Use Provider VAD</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.useProviderVad')} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">Min Utterance Duration (ms)</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.minUtterance')} />
                        </div>
                        <input
                            type="number"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.min_utterance_duration_ms || 600}
                            onChange={(e) => handleChange('min_utterance_duration_ms', parseInt(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">Max Utterance Duration (ms)</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.maxUtterance')} />
                        </div>
                        <input
                            type="number"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.max_utterance_duration_ms || 10000}
                            onChange={(e) => handleChange('max_utterance_duration_ms', parseInt(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">Utterance Padding (ms)</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.utterancePadding')} />
                        </div>
                        <input
                            type="number"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.utterance_padding_ms || 200}
                            onChange={(e) => handleChange('utterance_padding_ms', parseInt(e.target.value))}
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Fallback VAD (WebRTC)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="fallback_enabled"
                                className="rounded border-input"
                                checked={config.fallback_enabled ?? true}
                                onChange={(e) => handleChange('fallback_enabled', e.target.checked)}
                            />
                            <label htmlFor="fallback_enabled" className="text-sm font-medium">Enable Fallback</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.fallbackEnabled')} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">Aggressiveness (0-3)</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.aggressiveness')} />
                        </div>
                        <input
                            type="number"
                            min="0"
                            max="3"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.webrtc_aggressiveness || 1}
                            onChange={(e) => handleChange('webrtc_aggressiveness', parseInt(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">Start Frames</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.startFrames')} />
                        </div>
                        <input
                            type="number"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.webrtc_start_frames || 3}
                            onChange={(e) => handleChange('webrtc_start_frames', parseInt(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">End Silence Frames</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.endSilenceFrames')} />
                        </div>
                        <input
                            type="number"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.webrtc_end_silence_frames || 50}
                            onChange={(e) => handleChange('webrtc_end_silence_frames', parseInt(e.target.value))}
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-semibold">Upstream Squelch</h3>
                    <HelpTooltip content={t('configEditor.vadConfig.tooltips.upstreamSquelch')} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="upstream_squelch_enabled"
                                className="rounded border-input"
                                checked={config.upstream_squelch_enabled ?? true}
                                onChange={(e) => handleChange('upstream_squelch_enabled', e.target.checked)}
                            />
                            <label htmlFor="upstream_squelch_enabled" className="text-sm font-medium">Enable Upstream Squelch</label>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">Base RMS Threshold</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.baseRms')} />
                        </div>
                        <input
                            type="number"
                            min="0"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.upstream_squelch_base_rms ?? 200}
                            onChange={(e) => handleChange('upstream_squelch_base_rms', parseInt(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">Noise Factor</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.noiseFactor')} />
                        </div>
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.upstream_squelch_noise_factor ?? 2.5}
                            onChange={(e) => handleChange('upstream_squelch_noise_factor', parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">Noise EMA Alpha</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.noiseEmaAlpha')} />
                        </div>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.upstream_squelch_noise_ema_alpha ?? 0.06}
                            onChange={(e) => handleChange('upstream_squelch_noise_ema_alpha', parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">Min Speech Frames</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.minSpeechFrames')} />
                        </div>
                        <input
                            type="number"
                            min="1"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.upstream_squelch_min_speech_frames ?? 2}
                            onChange={(e) => handleChange('upstream_squelch_min_speech_frames', parseInt(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">End Silence Frames</label>
                            <HelpTooltip content={t('configEditor.vadConfig.tooltips.squelchEndSilence')} />
                        </div>
                        <input
                            type="number"
                            min="1"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.upstream_squelch_end_silence_frames ?? 15}
                            onChange={(e) => handleChange('upstream_squelch_end_silence_frames', parseInt(e.target.value))}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VADConfig;
