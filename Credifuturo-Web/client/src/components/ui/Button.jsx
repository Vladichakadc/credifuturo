import React from 'react';
import { cn } from '../../utils/cn';
import { Loader2 } from 'lucide-react';

const variants = {
    primary: 'bg-brand-primary text-white hover:bg-brand-dark focus:ring-brand-primary',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-200',
    danger: 'bg-white text-state-error border border-red-200 hover:bg-red-50 focus:ring-red-500',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-gray-200',
};

const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
};

export const Button = React.forwardRef(({
    className,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    disabled,
    children,
    type = 'button',
    ...props
}, ref) => {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || isLoading}
            className={cn(
                'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none shadow-sm',
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {children}
        </button>
    );
});

Button.displayName = 'Button';
