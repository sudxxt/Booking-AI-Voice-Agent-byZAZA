import React from 'react';
import { useTranslation } from 'react-i18next';
import HelpTooltip from '../ui/HelpTooltip';

interface StreamingConfigProps {
    config: any;
    onChange: (newConfig: any) => void;
}

const StreamingConfig: React.FC<StreamingConfigProps> = ({ config, onChange }) => {
    const { t } = useTranslation();
    const handleChange = (field: string, value: any) => {
        onChange({ ...config, [field]: value });
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <div className="flex items-center space-x-1">
                        <label className="text-sm font-medium">Chunk Size (ms)</label>
                        <HelpTooltip content={t('configEditor.streamingConfig.tooltips.chunkSize')} />
                    </div>
                    <input
                        type="number"
                        className="w-full p-2 rounded border border-input bg-background"
                        value={config.chunk_size_ms || 20}
                        onChange={(e) => handleChange('chunk_size_ms', parseInt(e.target.value))}
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex items-center space-x-1">
                        <label className="text-sm font-medium">Sample Rate</label>
                        <HelpTooltip content={t('configEditor.streamingConfig.tooltips.sampleRate')} />
                    </div>
                    <input
                        type="number"
                        className="w-full p-2 rounded border border-input bg-background"
                        value={config.sample_rate || 8000}
                        onChange={(e) => handleChange('sample_rate', parseInt(e.target.value))}
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex items-center space-x-1">
                        <label className="text-sm font-medium">Jitter Buffer (ms)</label>
                        <HelpTooltip content={t('configEditor.streamingConfig.tooltips.jitterBuffer')} />
                    </div>
                    <input
                        type="number"
                        className="w-full p-2 rounded border border-input bg-background"
                        value={config.jitter_buffer_ms || 950}
                        onChange={(e) => handleChange('jitter_buffer_ms', parseInt(e.target.value))}
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex items-center space-x-1">
                        <label className="text-sm font-medium">Connection Timeout (ms)</label>
                        <HelpTooltip content={t('configEditor.streamingConfig.tooltips.connectionTimeout')} />
                    </div>
                    <input
                        type="number"
                        className="w-full p-2 rounded border border-input bg-background"
                        value={config.connection_timeout_ms || 120000}
                        onChange={(e) => handleChange('connection_timeout_ms', parseInt(e.target.value))}
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex items-center space-x-1">
                        <label className="text-sm font-medium">Keepalive Interval (ms)</label>
                        <HelpTooltip content={t('configEditor.streamingConfig.tooltips.keepaliveInterval')} />
                    </div>
                    <input
                        type="number"
                        className="w-full p-2 rounded border border-input bg-background"
                        value={config.keepalive_interval_ms || 5000}
                        onChange={(e) => handleChange('keepalive_interval_ms', parseInt(e.target.value))}
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex items-center space-x-1">
                        <label className="text-sm font-medium">Provider Grace (ms)</label>
                        <HelpTooltip content={t('configEditor.streamingConfig.tooltips.providerGrace')} />
                    </div>
                    <input
                        type="number"
                        className="w-full p-2 rounded border border-input bg-background"
                        value={config.provider_grace_ms || 200}
                        onChange={(e) => handleChange('provider_grace_ms', parseInt(e.target.value))}
                    />
                </div>
            </div>

            <div className="flex flex-col space-y-1">
                <div className="flex items-center space-x-2">
                    <input
                        type="checkbox"
                        id="continuous_stream"
                        className="rounded border-input"
                        checked={config.continuous_stream ?? true}
                        onChange={(e) => handleChange('continuous_stream', e.target.checked)}
                    />
                    <label htmlFor="continuous_stream" className="text-sm font-medium">Continuous Stream</label>
                    <HelpTooltip content={t('configEditor.streamingConfig.tooltips.continuousStream')} />
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Diagnostics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="diag_enable_taps"
                                className="rounded border-input"
                                checked={config.diag_enable_taps ?? false}
                                onChange={(e) => handleChange('diag_enable_taps', e.target.checked)}
                            />
                            <label htmlFor="diag_enable_taps" className="text-sm font-medium">Enable Taps</label>
                            <HelpTooltip content={t('configEditor.streamingConfig.tooltips.diagEnableTaps')} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center space-x-1">
                            <label className="text-sm font-medium">Output Directory</label>
                            <HelpTooltip content={t('configEditor.streamingConfig.tooltips.diagOutDir')} />
                        </div>
                        <input
                            type="text"
                            className="w-full p-2 rounded border border-input bg-background"
                            value={config.diag_out_dir || '/tmp/ai-engine-taps'}
                            onChange={(e) => handleChange('diag_out_dir', e.target.value)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StreamingConfig;
