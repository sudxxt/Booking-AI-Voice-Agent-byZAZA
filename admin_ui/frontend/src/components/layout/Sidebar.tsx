import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Server,
    Workflow,
    MessageSquare,
    Wrench,
    Plug,
    Sliders,
    Activity,
    Zap,
    Brain,
    Radio,
    Globe,
    Container,
    FileText,
    Terminal,
    AlertTriangle,
    Code,
    HelpCircle,
    ExternalLink,
    HardDrive,
    ArrowUpCircle,
    Phone,
    CalendarClock,
    LogOut,
    Lock
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import ChangePasswordModal from '../auth/ChangePasswordModal';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const SidebarItem = ({ to, icon: Icon, label, end = false }: { to: string, icon: any, label: string, end?: boolean }) => (
    <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`
        }
    >
        <Icon className="w-4 h-4" />
        {label}
    </NavLink>
);

const SidebarGroup = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className="mb-6">
        <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
        </h3>
        <div className="space-y-1">
            {children}
        </div>
    </div>
);

const Sidebar = () => {
    const { user, logout } = useAuth();
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const { t } = useTranslation();

    return (
        <aside className="w-64 border-r border-border bg-card/50 backdrop-blur flex flex-col h-full">
            <div className="p-6 border-b border-border/50">
                <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
                        <Activity className="w-5 h-5" />
                    </div>
                    Asterisk AI
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-6 px-3">
                <SidebarGroup title={t('sidebar.overview')}>
                    <SidebarItem to="/" icon={LayoutDashboard} label={t('nav.dashboard')} end />
                    <SidebarItem to="/history" icon={Phone} label={t('nav.callHistory')} />
                    <SidebarItem to="/scheduling" icon={CalendarClock} label={t('nav.scheduling')} />
                    <SidebarItem to="/wizard" icon={Zap} label={t('nav.wizard')} />
                </SidebarGroup>

                <SidebarGroup title={t('sidebar.coreConfig')}>
                    <SidebarItem to="/providers" icon={Server} label={t('nav.providers')} />
                    <SidebarItem to="/pipelines" icon={Workflow} label={t('nav.pipelines')} />
                    <SidebarItem to="/contexts" icon={MessageSquare} label={t('nav.contexts')} />
                    <SidebarItem to="/profiles" icon={Sliders} label={t('nav.profiles')} />
                    <SidebarItem to="/tools" icon={Wrench} label={t('nav.tools')} />
                    <SidebarItem to="/mcp" icon={Plug} label={t('nav.mcp')} />
                </SidebarGroup>

                <SidebarGroup title={t('sidebar.advancedSettings')}>
                    <SidebarItem to="/vad" icon={Activity} label={t('nav.vad')} />
                    <SidebarItem to="/streaming" icon={Zap} label={t('nav.streaming')} />
                    <SidebarItem to="/llm" icon={Brain} label={t('nav.llm')} />
                    <SidebarItem to="/transport" icon={Radio} label={t('nav.transport')} />
                    <SidebarItem to="/barge-in" icon={AlertTriangle} label={t('nav.bargeIn')} />
                </SidebarGroup>

                <SidebarGroup title={t('sidebar.system')}>
                    <SidebarItem to="/env" icon={Globe} label={t('nav.env')} />
                    <SidebarItem to="/docker" icon={Container} label={t('nav.docker')} />
                    <SidebarItem to="/asterisk" icon={Phone} label={t('nav.asterisk')} />
                    <SidebarItem to="/models" icon={HardDrive} label={t('nav.models')} />
                    <SidebarItem to="/updates" icon={ArrowUpCircle} label={t('nav.updates')} />
                    <SidebarItem to="/logs" icon={FileText} label={t('nav.logs')} />
                    <SidebarItem to="/terminal" icon={Terminal} label={t('nav.terminal')} />
                </SidebarGroup>

                <SidebarGroup title={t('sidebar.dangerZone')}>
                    <SidebarItem to="/yaml" icon={Code} label={t('nav.yaml')} />
                </SidebarGroup>

                <SidebarGroup title={t('sidebar.support')}>
                    <SidebarItem to="/help" icon={HelpCircle} label={t('nav.help')} />
                    <a
                        href="/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                        <ExternalLink className="w-4 h-4" />
                        {t('nav.apiDocs')}
                    </a>
                </SidebarGroup>
            </div>

            <div className="p-4 border-t border-border/50">
                <div className="flex items-center gap-3 px-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold uppercase">
                        {user?.username?.substring(0, 2) || 'AD'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user?.username || t('header.admin')}</p>
                        <p className="text-xs text-muted-foreground truncate">{t('sidebar.administrator')}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsPasswordModalOpen(true)}
                        className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        title={t('sidebar.password')}
                    >
                        <Lock className="w-3 h-3" />
                        {t('sidebar.password')}
                    </button>
                    <button
                        onClick={logout}
                        className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                        title={t('sidebar.logout')}
                    >
                        <LogOut className="w-3 h-3" />
                        {t('sidebar.logout')}
                    </button>
                </div>
            </div>

            <ChangePasswordModal
                isOpen={isPasswordModalOpen}
                onClose={() => setIsPasswordModalOpen(false)}
            />
        </aside>
    );
};

export default Sidebar;
