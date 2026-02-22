import React from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

const Header = () => {
    const location = useLocation();
    const { t } = useTranslation();
    const pathSegments = location.pathname.split('/').filter(Boolean);

    const getBreadcrumbName = (segment: string) => {
        const map: Record<string, string> = {
            'providers': t('nav.providers'),
            'pipelines': t('nav.pipelines'),
            'contexts': t('nav.contexts'),
            'tools': t('nav.tools'),
            'outbound': t('nav.outbound'),
            'history': t('nav.callHistory'),
            'vad': t('nav.vad'),
            'streaming': t('nav.streaming'),
            'llm': t('nav.llm'),
            'env': t('nav.env'),
            'docker': t('nav.docker'),
            'logs': t('nav.logs'),
            'yaml': t('nav.yaml')
        };
        return map[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
    };

    return (
        <header className="h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-6 z-10 sticky top-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{t('header.admin')}</span>
                {pathSegments.length > 0 && <ChevronRight className="w-4 h-4" />}
                {pathSegments.map((segment, index) => (
                    <React.Fragment key={segment}>
                        <span className={index === pathSegments.length - 1 ? 'font-medium text-foreground' : ''}>
                            {getBreadcrumbName(segment)}
                        </span>
                        {index < pathSegments.length - 1 && <ChevronRight className="w-4 h-4" />}
                    </React.Fragment>
                ))}
            </div>

            {/* Global actions removed - pages handle their own saving */}
            <div className="flex items-center gap-2">
                <LanguageSwitcher />
            </div>
        </header>
    );
};

export default Header;
