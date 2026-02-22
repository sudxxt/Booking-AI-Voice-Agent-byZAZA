import React from 'react';

interface ConfigCardProps {
    children: React.ReactNode;
    title?: string;
    description?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}

export const ConfigCard = ({ children, title, description, icon, action, className = '' }: ConfigCardProps) => {
    return (
        <div className={`bg-card border border-border rounded-lg shadow-sm p-6 transition-all duration-200 hover:shadow-md hover:border-border/80 ${className}`}>
            {(title || icon || action) && (
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/50">
                    <div className="flex items-center gap-3">
                        {icon && <div className="text-muted-foreground bg-accent/50 p-2 rounded-md">{icon}</div>}
                        <div>
                            {title && <h3 className="text-lg font-semibold tracking-tight">{title}</h3>}
                            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
                        </div>
                    </div>
                    {action && <div>{action}</div>}
                </div>
            )}
            {children}
        </div>
    );
};
