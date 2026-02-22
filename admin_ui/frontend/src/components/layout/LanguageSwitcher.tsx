import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

const LanguageSwitcher = () => {
    const { i18n } = useTranslation();

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
    };

    return (
        <div className="relative group">
            <button className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md transition-colors bg-secondary/50">
                {i18n.language.toUpperCase().substring(0, 2)}
                <ChevronDown className="w-4 h-4" />
            </button>
            <div className="absolute right-0 mt-1 w-24 bg-popover border border-border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <button
                    onClick={() => changeLanguage('en')}
                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors ${i18n.language.startsWith('en') ? 'text-primary font-medium' : 'text-foreground'}`}
                >
                    EN
                </button>
                <button
                    onClick={() => changeLanguage('ru')}
                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors ${i18n.language.startsWith('ru') ? 'text-primary font-medium' : 'text-foreground'}`}
                >
                    RU
                </button>
            </div>
        </div>
    );
};

export default LanguageSwitcher;
