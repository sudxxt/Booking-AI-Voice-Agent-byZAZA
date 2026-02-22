import { useState, useEffect } from 'react';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { Container, RefreshCw, AlertCircle, Clock, CheckCircle2, XCircle, Trash2, Database, Layers, Box } from 'lucide-react';
import { ConfigSection } from '../../components/ui/ConfigSection';
import { ConfigCard } from '../../components/ui/ConfigCard';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { ApiErrorInfo, buildDockerAccessHints, describeApiError } from '../../utils/apiErrors';

interface ContainerInfo {
    id: string;
    name: string;
    image: string;
    status: string;
    state: string;
    uptime?: string;
    started_at?: string;
    ports?: string[];
    mounts?: MountInfo[];
}

interface MountInfo {
    type?: string;
    source?: string;
    destination?: string;
    rw?: boolean;
    mode?: string;
    propagation?: string;
    name?: string;
    driver?: string;
}

interface DiskUsage {
    images: { total: number; active: number; size: string; reclaimable: string };
    containers: { total: number; active: number; size: string; reclaimable: string };
    volumes: { total: number; active: number; size: string; reclaimable: string };
    build_cache: { total: number; active: number; size: string; reclaimable: string };
}

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'warning';
}

const DockerPage = () => {
    const { t } = useTranslation();
    const [containers, setContainers] = useState<ContainerInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<ApiErrorInfo | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [diskUsage, setDiskUsage] = useState<DiskUsage | null>(null);
    const [diskLoading, setDiskLoading] = useState(false);
    const [pruning, setPruning] = useState(false);
    const [expandedMounts, setExpandedMounts] = useState<Record<string, boolean>>({});

    const mountSourceLabel = (m: MountInfo) => {
        if ((m.type || '').toLowerCase() === 'volume') {
            return m.name ? `volume:${m.name}` : (m.source || 'volume');
        }
        return m.source || m.name || '';
    };

    const isInterestingMount = (m: MountInfo) => {
        const dest = (m.destination || '').toLowerCase();
        return dest.includes('asterisk_media') || dest.includes('data') || dest.includes('/mnt/');
    };

    const showToast = (message: string, type: 'success' | 'error' | 'warning') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    };

    const fetchDiskUsage = async () => {
        setDiskLoading(true);
        try {
            const res = await axios.get('/api/system/docker/disk-usage');
            setDiskUsage(res.data);
        } catch (err: any) {
            console.error('Failed to fetch Docker disk usage', err);
        } finally {
            setDiskLoading(false);
        }
    };

    const { confirm } = useConfirmDialog();

    const handlePrune = async (type: 'build_cache' | 'images' | 'all') => {
        const title = type === 'all' ? t('system.docker.prune.allTitle') : type === 'build_cache' ? t('system.docker.prune.cacheTitle') : t('system.docker.prune.imagesTitle');
        const description = type === 'all' ? t('system.docker.prune.allDesc') : type === 'build_cache' ? t('system.docker.prune.cacheDesc') : t('system.docker.prune.imagesDesc');

        const confirmed = await confirm({
            title,
            description,
            confirmText: t('system.docker.prune.confirmClean'),
            variant: 'destructive'
        });
        if (!confirmed) return;

        setPruning(true);
        try {
            const res = await axios.post('/api/system/docker/prune', {
                prune_build_cache: type === 'build_cache' || type === 'all',
                prune_images: type === 'images' || type === 'all',
                prune_containers: type === 'all',
                prune_volumes: false  // Never auto-prune volumes
            });

            if (res.data.success) {
                showToast(t('system.docker.cleanupComplete', { amount: res.data.space_reclaimed || t('system.docker.spaceFreed') }), 'success');
                fetchDiskUsage();
            } else {
                showToast(t('system.docker.cleanupFailed'), 'error');
            }
        } catch (err: any) {
            showToast(`${t('system.docker.cleanupFailed')}: ${err.response?.data?.detail || err.message}`, 'error');
        } finally {
            setPruning(false);
        }
    };

    const fetchContainers = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/system/containers');
            setContainers(res.data);
        } catch (err: any) {
            const info = describeApiError(err, '/api/system/containers');
            console.error('Failed to fetch containers', info);
            setError(info);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContainers();
        fetchDiskUsage();
    }, []);

    const handleRestart = async (id: string, name: string) => {
        setActionLoading(id);
        try {
            await axios.post(`/api/system/containers/${id}/restart`, {}, { timeout: 30000 });
            showToast(t('system.docker.restarted', { name }), 'success');
            await fetchContainers();
        } catch (err: any) {
            // Network error when restarting admin_ui is expected - the container restarts before response
            if (name === 'admin_ui' && (err.message === 'Network Error' || err.code === 'ECONNABORTED')) {
                showToast(t('system.docker.adminUiRestarting'), 'success');
                // Wait for container to come back up, then reload
                setTimeout(() => window.location.reload(), 5000);
                return;
            }
            showToast(`${t('system.docker.failedRestart')}: ${err.response?.data?.detail || err.message}`, 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusColor = (status: string) => {
        if (status.includes('running')) return 'bg-green-500/10 text-green-500 border-green-500/20';
        if (status.includes('exited')) return 'bg-red-500/10 text-red-500 border-red-500/20';
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('system.docker.title')}</h1>
                    <p className="text-muted-foreground mt-1">
                        {t('system.docker.desc')}
                    </p>
                </div>
                <button
                    onClick={fetchContainers}
                    disabled={loading}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    {t('system.docker.refresh')}
                </button>
            </div>

            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-md flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    <div className="min-w-0">
                        <div className="font-medium">{t('system.docker.unableToLoad')}</div>
                        <div className="text-sm text-muted-foreground break-words">
                            {error.status ? `HTTP ${error.status}` : error.kind}
                            {error.detail ? ` - ${error.detail}` : ''}
                        </div>
                        <details className="mt-2 text-sm text-muted-foreground">
                            <summary className="cursor-pointer hover:text-foreground">{t('system.docker.troubleshooting')}</summary>
                            <ul className="list-disc pl-5 mt-2 space-y-1">
                                {buildDockerAccessHints(error).map((h, idx) => (
                                    <li key={idx}>{h}</li>
                                ))}
                            </ul>
                        </details>
                    </div>
                </div>
            )}

            {/* Docker Disk Usage Section */}
            <ConfigSection title={t('system.docker.diskUsageTitle')} description={t('system.docker.diskUsageDesc')}>
                <ConfigCard className="p-4">
                    {diskLoading && !diskUsage ? (
                        <div className="text-center py-4 text-muted-foreground">{t('system.docker.loadingDisk')}</div>
                    ) : diskUsage ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {/* Build Cache */}
                                <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Layers className="w-4 h-4 text-orange-500" />
                                        <span className="text-sm font-medium">{t('system.docker.buildCache')}</span>
                                    </div>
                                    <div className="text-lg font-bold">{diskUsage.build_cache.size}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('system.docker.reclaimable', { amount: diskUsage.build_cache.reclaimable })}
                                    </div>
                                </div>

                                {/* Images */}
                                <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Box className="w-4 h-4 text-blue-500" />
                                        <span className="text-sm font-medium">{t('system.docker.images')}</span>
                                    </div>
                                    <div className="text-lg font-bold">{diskUsage.images.size}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {diskUsage.images.total} {t('system.docker.total')}, {diskUsage.images.active} {t('system.docker.active')}
                                    </div>
                                </div>

                                {/* Containers */}
                                <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Container className="w-4 h-4 text-green-500" />
                                        <span className="text-sm font-medium">{t('system.docker.containers')}</span>
                                    </div>
                                    <div className="text-lg font-bold">{diskUsage.containers.size}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {diskUsage.containers.total} {t('system.docker.total')}, {diskUsage.containers.active} {t('system.docker.active')}
                                    </div>
                                </div>

                                {/* Volumes */}
                                <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Database className="w-4 h-4 text-purple-500" />
                                        <span className="text-sm font-medium">{t('system.docker.volumes')}</span>
                                    </div>
                                    <div className="text-lg font-bold">{diskUsage.volumes.size}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {diskUsage.volumes.total} {t('system.docker.total')}
                                    </div>
                                </div>
                            </div>

                            {/* Cleanup Actions */}
                            <div className="flex flex-wrap gap-2 pt-2 border-t">
                                <button
                                    onClick={() => handlePrune('build_cache')}
                                    disabled={pruning}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 disabled:opacity-50 border border-orange-500/20"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('system.docker.cleanBuildCache')}
                                </button>
                                <button
                                    onClick={() => handlePrune('images')}
                                    disabled={pruning}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 disabled:opacity-50 border border-blue-500/20"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('system.docker.cleanImages')}
                                </button>
                                <button
                                    onClick={() => fetchDiskUsage()}
                                    disabled={diskLoading}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-muted hover:bg-muted/80 disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${diskLoading ? 'animate-spin' : ''}`} />
                                    {t('system.docker.refresh')}
                                </button>
                            </div>

                            {pruning && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    {t('system.docker.cleaningUp')}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-4 text-muted-foreground">
                            {t('system.docker.unableToLoadDisk')}
                        </div>
                    )}
                </ConfigCard>
            </ConfigSection>

            <ConfigSection title={t('system.docker.serviceStatus')} description={t('system.docker.serviceStatusDesc')}>
                <div className="grid gap-4">
                    {loading && containers.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">{t('system.docker.loadingContainers')}</div>
                    ) : containers.length === 0 && !error ? (
                        <div className="text-center p-8 text-muted-foreground">{t('system.docker.noContainers')}</div>
                    ) : (
                        containers.map(container => {
                            const containerName = container.name.replace(/^\//, '');
                            const isRestarting = actionLoading === containerName;
                            const mounts = container.mounts || [];
                            const expanded = !!expandedMounts[container.id];
                            const filtered = mounts.filter(isInterestingMount);
                            const collapsed = (filtered.length > 0 ? filtered : mounts).slice(0, 2);
                            const mountsToShow = expanded ? mounts : collapsed;
                            const canToggleMounts = mounts.length > collapsed.length;

                            return (
                                <ConfigCard key={container.id} className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-primary/10 rounded-lg">
                                                <Container className="w-6 h-6 text-primary" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-lg">{containerName}</h4>
                                                <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]" title={container.image}>
                                                    {container.image}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6">
                                            {/* Uptime */}
                                            {container.uptime && (
                                                <div className="text-right hidden sm:block">
                                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Clock className="w-3 h-3" />
                                                        <span>{t('system.docker.uptime')}</span>
                                                    </div>
                                                    <div className="text-sm font-medium">{container.uptime}</div>
                                                </div>
                                            )}

                                            {/* Ports */}
                                            {container.ports && container.ports.length > 0 && (
                                                <div className="text-right hidden md:block">
                                                    <div className="text-xs text-muted-foreground">{t('system.docker.ports')}</div>
                                                    <div className="text-xs font-mono">
                                                        {container.ports.slice(0, 2).join(', ')}
                                                        {container.ports.length > 2 && ` +${container.ports.length - 2}`}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Status Badge */}
                                            <div className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(container.status)}`}>
                                                {isRestarting ? t('system.docker.restartingStatus') : container.status.toUpperCase()}
                                            </div>

                                            {/* Restart Button */}
                                            <button
                                                onClick={() => handleRestart(containerName, containerName)}
                                                disabled={isRestarting}
                                                className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
                                                title={t('system.docker.restartTooltip')}
                                            >
                                                <RefreshCw className={`w-4 h-4 ${isRestarting ? 'animate-spin' : ''}`} />
                                            </button>
                                        </div>
                                    </div>

                                    {mounts.length > 0 && (
                                        <div className="mt-3 pt-3 border-t">
                                            <div className="flex items-center justify-between">
                                                <div className="text-xs font-medium text-muted-foreground">{t('system.docker.mounts')}</div>
                                                {canToggleMounts && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedMounts(prev => ({ ...prev, [container.id]: !expanded }))}
                                                        className="text-xs text-primary hover:underline"
                                                    >
                                                        {expanded ? t('system.docker.hide') : t('system.docker.showAll', { count: mounts.length })}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="mt-2 space-y-1">
                                                {mountsToShow.map((m, idx) => {
                                                    const dest = m.destination || '';
                                                    const src = mountSourceLabel(m) || '<unknown>';
                                                    const mode = m.rw === false ? 'ro' : 'rw';
                                                    const isMedia = dest.includes('/mnt/asterisk_media') || dest.toLowerCase().includes('asterisk_media');

                                                    return (
                                                        <div
                                                            key={`${container.id}-mount-${idx}`}
                                                            className={`flex items-center justify-between gap-2 rounded border px-2 py-1 ${isMedia ? 'bg-blue-500/10 border-blue-500/20' : 'bg-muted/30 border-border'
                                                                }`}
                                                            title={`${src} → ${dest}`}
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className="text-xs font-mono truncate">{src}</span>
                                                                <span className="text-xs text-muted-foreground">→</span>
                                                                <span className="text-xs font-mono truncate">{dest}</span>
                                                            </div>
                                                            <span className="text-[11px] text-muted-foreground flex-shrink-0">{mode}</span>
                                                        </div>
                                                    );
                                                })}
                                                {!expanded && mounts.length > mountsToShow.length && (
                                                    <div className="text-[11px] text-muted-foreground">
                                                        +{mounts.length - mountsToShow.length} {t('common.more') || 'more'} ({t('system.docker.mountsShowAllHint') || 'click "Show all"'})
                                                    </div>
                                                )}
                                                <div className="text-[11px] text-muted-foreground">
                                                    {t('system.docker.mountsHint')}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </ConfigCard>
                            );
                        })
                    )}
                </div>
            </ConfigSection>

            {/* Toast Notifications */}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-right ${toast.type === 'success'
                            ? 'bg-green-500 text-white'
                            : 'bg-red-500 text-white'
                            }`}
                    >
                        {toast.type === 'success' ? (
                            <CheckCircle2 className="w-4 h-4" />
                        ) : (
                            <XCircle className="w-4 h-4" />
                        )}
                        {toast.message}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DockerPage;
