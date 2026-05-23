import React from 'react';
import { cn } from '../../utils/cn';

const variants = {
    default: 'bg-brand-primary/10 text-brand-primary border-transparent',
    secondary: 'bg-gray-100 text-gray-700 border-transparent',
    outline: 'text-gray-900 border-gray-200',
    success: 'bg-state-success/15 text-green-700 border-transparent',
    warning: 'bg-state-warning/15 text-yellow-700 border-transparent',
    error: 'bg-state-error/15 text-red-700 border-transparent',
    info: 'bg-state-info/15 text-blue-700 border-transparent',
};

export const Badge = ({ className, variant = 'default', children, ...props }) => {
    return (
        <div
            className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                variants[variant],
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
};
