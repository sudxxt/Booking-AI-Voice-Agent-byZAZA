const fs = require('fs');
const file = 'c:/Users/sudxx/OneDrive/Desktop/Asterisk-AI-Voice-Agent/admin_ui/frontend/src/pages/Advanced/BargeInPage.tsx';
let txt = fs.readFileSync(file, 'utf8');

if (!txt.includes('useTranslation')) {
    txt = txt.replace(/import \{.*?\} from 'lucide-react';/, match => match + '\nimport { useTranslation } from \'react-i18next\';');
    txt = txt.replace(/const BargeInPage = \(\) => \{/, 'const BargeInPage = () => {\n    const { t } = useTranslation();');
}

// Toasts
txt = txt.replace(/'Barge-in configuration saved'/, 't(\'advanced.bargeIn.saveSuccess\')');
txt = txt.replace(/'Failed to save configuration'/, 't(\'advanced.bargeIn.saveFailed\')');
txt = txt.replace(/'AI Engine restarted! Changes are now active\.'/g, 't(\'advanced.bargeIn.restartSuccess\')');

// Warnings and buttons
txt = txt.replace(/Changes to barge-in configurations require an AI Engine restart to take effect\./g, '{t(\'advanced.bargeIn.restartWarning\')}');
txt = txt.replace(/\{restartingEngine \? 'Restarting\.\.\.' : 'Reload AI Engine'\}/g, '{restartingEngine ? t(\'advanced.bargeIn.restarting\') : t(\'advanced.bargeIn.reloadAIEngine\')}');
txt = txt.replace(/<h1 className=\"text-3xl font-bold tracking-tight\">Barge-in Settings<\/h1>/g, '<h1 className=\"text-3xl font-bold tracking-tight\">{t(\'advanced.bargeIn.title\')}</h1>');
txt = txt.replace(/Configure how callers can interrupt the AI agent during responses\./g, '{t(\'advanced.bargeIn.desc\')}');
txt = txt.replace(/\{saving \? 'Saving\.\.\.' : 'Save Changes'\}/g, '{saving ? t(\'advanced.bargeIn.saving\') : t(\'advanced.bargeIn.saveChanges\')}');

// ConfigSections
txt = txt.replace(/title=\"Barge-in Control\"[ \n]+description=\"Allow callers to interrupt the AI while it's speaking\.\"/g, 'title={t(\'advanced.bargeIn.controlTitle\')}\n                description={t(\'advanced.bargeIn.controlDesc\')}');

// Switches and Inputs
txt = txt.replace(/label=\"Enable Barge-in\"/g, 'label={t(\'advanced.bargeIn.enableLabel\')}');
txt = txt.replace(/description=\"Allow users to interrupt the AI agent during TTS playback\.\"/g, 'description={t(\'advanced.bargeIn.enableDesc\')}');
txt = txt.replace(/tooltip=\"When enabled, the engine immediately flushes\\/stops local agent audio when it detects caller speech during an agent response\.\"/g, 'tooltip={t(\'advanced.bargeIn.enableTooltip\')}');

txt = txt.replace(/label=\"Energy Threshold\"/g, 'label={t(\'advanced.bargeIn.energyThresholdLabel\')}');
txt = txt.replace(/tooltip=\"Caller energy threshold \\(RMS over PCM16\\) for provider-owned mode\. Higher = less sensitive \\(fewer false barge-ins\\), lower = more sensitive \\(better for quiet callers\\)\. For pipelines, see 'Pipeline Energy Threshold' in Advanced settings below\.\"/g, 'tooltip={t(\'advanced.bargeIn.energyThresholdTooltip\')}');

txt = txt.replace(/label=\"Minimum Duration \\(ms\\)\"/g, 'label={t(\'advanced.bargeIn.minDurationLabel\')}');
txt = txt.replace(/tooltip=\"Minimum sustained caller speech time required before triggering barge-in\. Higher reduces false triggers but feels less responsive\.\"/g, 'tooltip={t(\'advanced.bargeIn.minDurationTooltip\')}');

txt = txt.replace(/label=\"Cooldown \\(ms\\)\"/g, 'label={t(\'advanced.bargeIn.cooldownLabel\')}');
txt = txt.replace(/tooltip=\"Minimum time between barge-in triggers\. Prevents repeated triggers from echo\\/noise after an interruption\.\"/g, 'tooltip={t(\'advanced.bargeIn.cooldownTooltip\')}');

txt = txt.replace(/label=\"Post-TTS Protection \\(ms\\)\"/g, 'label={t(\'advanced.bargeIn.postTTSLabel\')}');
txt = txt.replace(/tooltip=\"Guard window after agent audio ends\. Helps avoid self-echo or tail audio being mistaken as caller speech\.\"/g, 'tooltip={t(\'advanced.bargeIn.postTTSTooltip\')}');

txt = txt.replace(/label=\"Provider Output Suppress \\(ms\\)\"/g, 'label={t(\'advanced.bargeIn.outputSuppressLabel\')}');
txt = txt.replace(/tooltip=\"After a barge-in, locally suppress provider audio briefly so previously generated speech doesn’t “resume” mid-sentence\.\"/g, 'tooltip={t(\'advanced.bargeIn.outputSuppressTooltip\')}');

txt = txt.replace(/<p className=\"font-medium mb-1\">Tuning Tips<\/p>/g, '<p className=\"font-medium mb-1\">{t(\'advanced.bargeIn.tuningTipsTitle\')}</p>');
txt = txt.replace(/<strong>Energy Threshold:<\/strong> Increase if barge-in is too sensitive \\(500-1200 typical\\)/g, '<strong>{t(\'advanced.bargeIn.energyThresholdLabel\')}:</strong> {t(\'advanced.bargeIn.tuningTip1\')}');
txt = txt.replace(/<strong>Provider Output Suppress:<\/strong> Increase if provider resumes speaking pre-barge audio \\(800-1600ms typical\\)/g, '<strong>{t(\'advanced.bargeIn.outputSuppressLabel\')}:</strong> {t(\'advanced.bargeIn.tuningTip2\')}');
txt = txt.replace(/<strong>Post-TTS Protection:<\/strong> Increase if you see immediate re-triggers after TTS ends \\(200-600ms typical\\)/g, '<strong>{t(\'advanced.bargeIn.postTTSLabel\')}:</strong> {t(\'advanced.bargeIn.tuningTip3\')}');

txt = txt.replace(/title=\"Advanced\"[ \n]+description=\"Additional knobs for provider-owned vs pipeline modes\.\"/g, 'title={t(\'advanced.bargeIn.advancedTitle\')}\n                description={t(\'advanced.bargeIn.advancedDesc\')}');
txt = txt.replace(/>Show advanced settings</g, '>{t(\'advanced.bargeIn.showAdvanced\')}<');
txt = txt.replace(/>Protection windows</g, '>{t(\'advanced.bargeIn.protectionWindows\')}<');

txt = txt.replace(/label=\"Initial Protection \\(ms\\)\"/g, 'label={t(\'advanced.bargeIn.initProtectLabel\')}');
txt = txt.replace(/tooltip=\"Short guard window at the start of agent output to avoid triggering on initial burst\\/codec artifacts\.\"/g, 'tooltip={t(\'advanced.bargeIn.initProtectTooltip\')}');

txt = txt.replace(/label=\"Greeting Protection \\(ms\\)\"/g, 'label={t(\'advanced.bargeIn.greetProtectLabel\')}');
txt = txt.replace(/tooltip=\"Extra guard window during the initial greeting turn \\(useful if greetings are short and prone to false triggers\)\.\"/g, 'tooltip={t(\'advanced.bargeIn.greetProtectTooltip\')}');

txt = txt.replace(/>Provider-owned mode</g, '>{t(\'advanced.bargeIn.providerOwnedMode\')}<');

txt = txt.replace(/label=\"Provider Fallback Enabled\"/g, 'label={t(\'advanced.bargeIn.providerFallbackLabel\')}');
txt = txt.replace(/description=\"Use local VAD fallback only for providers that don’t emit explicit interruption events\.\"/g, 'description={t(\'advanced.bargeIn.providerFallbackDesc\')}');
txt = txt.replace(/tooltip=\"If enabled, the engine can trigger barge-in using local VAD only after media is confirmed and only for the providers listed below\.\"/g, 'tooltip={t(\'advanced.bargeIn.providerFallbackTooltip\')}');

txt = txt.replace(/label=\"Provider Fallback Providers\"/g, 'label={t(\'advanced.bargeIn.providerFallbackProvidersLabel\')}');
txt = txt.replace(/tooltip=\"Comma-separated provider names where local fallback may apply \\(e\.g\., google_live, deepgram\\)\.\"/g, 'tooltip={t(\'advanced.bargeIn.providerFallbackProvidersTooltip\')}');

txt = txt.replace(/label=\"Suppress Extend \\(ms\\)\"/g, 'label={t(\'advanced.bargeIn.suppressExtendLabel\')}');
txt = txt.replace(/tooltip=\"While caller keeps speaking after a barge-in, extend suppression so agent doesn’t resume too early\.\"/g, 'tooltip={t(\'advanced.bargeIn.suppressExtendTooltip\')}');

txt = txt.replace(/label=\"Chunk Extend \\(ms\\)\"/g, 'label={t(\'advanced.bargeIn.chunkExtendLabel\')}');
txt = txt.replace(/tooltip=\"While suppressed, extend suppression when provider chunks keep arriving \\(prevents tail audio from restarting output\\)\.\"/g, 'tooltip={t(\'advanced.bargeIn.chunkExtendTooltip\')}');

txt = txt.replace(/>Pipeline \\/ local_hybrid mode</g, '>{t(\'advanced.bargeIn.pipelineMode\')}<');

txt = txt.replace(/label=\"Enable TALK_DETECT\"/g, 'label={t(\'advanced.bargeIn.talkDetectLabel\')}');
txt = txt.replace(/description=\"Use Asterisk TALK_DETECT for robust barge-in during local file playback\.\"/g, 'description={t(\'advanced.bargeIn.talkDetectDesc\')}');
txt = txt.replace(/tooltip=\"Recommended for local_hybrid: Asterisk DSP detects caller speech even during ARI file playback\.\"/g, 'tooltip={t(\'advanced.bargeIn.talkDetectTooltip\')}');

txt = txt.replace(/label=\"Pipeline Min Duration \\(ms\\)\"/g, 'label={t(\'advanced.bargeIn.pipelineMinLabel\')}');
txt = txt.replace(/tooltip=\"Pipeline-specific minimum speech duration \\(more sensitive than provider-owned mode\\)\.\"/g, 'tooltip={t(\'advanced.bargeIn.pipelineMinTooltip\')}');

txt = txt.replace(/label=\"Pipeline Energy Threshold\"/g, 'label={t(\'advanced.bargeIn.pipelineEnergyLabel\')}');
txt = txt.replace(/tooltip=\"Pipeline-specific energy threshold \\(more sensitive than provider-owned mode\\)\.\"/g, 'tooltip={t(\'advanced.bargeIn.pipelineEnergyTooltip\')}');

txt = txt.replace(/label=\"TALK_DETECT Silence \\(ms\\)\"/g, 'label={t(\'advanced.bargeIn.talkDetectSilenceLabel\')}');
txt = txt.replace(/tooltip=\"Asterisk TALK_DETECT\\(set\\) silence threshold in ms\. Higher treats more audio as ‘silence’\.\"/g, 'tooltip={t(\'advanced.bargeIn.talkDetectSilenceTooltip\')}');

txt = txt.replace(/label=\"TALK_DETECT Talking Threshold\"/g, 'label={t(\'advanced.bargeIn.talkDetectTalkingLabel\')}');
txt = txt.replace(/tooltip=\"Asterisk TALK_DETECT\\(set\\) talking threshold \\(DSP energy\\)\. Higher requires louder speech to trigger\.\"/g, 'tooltip={t(\'advanced.bargeIn.talkDetectTalkingTooltip\')}');

txt = txt.replace(/title=\"Current Configuration\"[ \n]+description=\"Summary of your barge-in settings\.\"/g, 'title={t(\'advanced.bargeIn.currentConfigTitle\')}\n                description={t(\'advanced.bargeIn.currentConfigDesc\')}');

txt = txt.replace(/>Status:</g, '>{t(\'advanced.bargeIn.status\')}:<');
txt = txt.replace(/\{bargeInConfig\.enabled \? 'Enabled' : 'Disabled'\}/g, '{bargeInConfig.enabled ? t(\'advanced.bargeIn.enabled\') : t(\'advanced.bargeIn.disabled\')}');
txt = txt.replace(/>Energy Threshold:</g, '>{t(\'advanced.bargeIn.energyThresholdLabel\')}:<');
txt = txt.replace(/>Minimum Duration:</g, '>{t(\'advanced.bargeIn.minDurationLabel\')}:<');
txt = txt.replace(/>Post-TTS Protection:</g, '>{t(\'advanced.bargeIn.postTTSLabel\')}:<');

fs.writeFileSync(file, txt);
console.log('Replacements completed.');
