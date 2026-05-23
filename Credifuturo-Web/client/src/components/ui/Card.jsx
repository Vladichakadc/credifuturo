import React from 'react';
import { cn } from '../../utils/cn';

export const Card = React.forwardRef(({ className, children, ...props }, ref) => {
    return (
        <div
            ref={ref}
            className={cn(
                'bg-ui-surface rounded-lg border border-ui-border shadow-card text-gray-900',
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
});

export const CardHeader = React.forwardRef(({ className, children, ...props }, ref) => {
    return (
        <div
            ref={ref}
            className={cn('flex flex-col space-y-1.5 p-6', className)}
            {...props}
        >
            {children}
        </div>
    );
});

export const CardTitle = React.forwardRef(({ className, children, ...props }, ref) => {
    return (
        <h3
            ref={ref}
            className={cn('font-semibold leading-none tracking-tight text-xl text-brand-primary', className)}
            {...props}
        >
            {children}
        </h3>
    );
});

export const CardContent = React.forwardRef(({ className, children, ...props }, ref) => {
    return (
        <div ref={ref} className={cn('p-6 pt-0', className)} {...props}>
            {children}
        </div>
    );
});

export const CardFooter = React.forwardRef(({ className, children, ...props }, ref) => {
    return (
        <div
            ref={ref}
            className={cn('flex items-center p-6 pt-0', className)}
            {...props}
        >
            {children}
        </div>
    );
});

Card.displayName = 'Card';
CardHeader.displayName = 'CardHeader';
CardTitle.displayName = 'CardTitle';
CardContent.displayName = 'CardContent';
CardFooter.displayName = 'CardFooter';
