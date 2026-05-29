import React from 'react';
import { cn } from '../../utils/cn';

export const Input = React.forwardRef(({ className, error, ...props }, ref) => {
    return (
        <input
            className={cn(
                'flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/20 focus-visible:border-brand-primary disabled:cursor-not-allowed disabled:opacity-50',
                error && 'border-state-error focus-visible:ring-state-error/20',
                className
            )}
            ref={ref}
            {...props}
        />
    );
});
Input.displayName = 'Input';

export const Label = React.forwardRef(({ className, ...props }, ref) => {
    return (
        <label
            ref={ref}
            className={cn(
                'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-700 mb-2 block',
                className
            )}
            {...props}
        />
    );
});
Label.displayName = 'Label';

export const FormField = ({ label, error, children, className }) => {
    const autoId = React.useId();
    // Associate the label with its control for accessibility. Only when there's a
    // single element child; otherwise fall back to an unlabeled-for label (safe no-op).
    const onlyChild = React.Children.count(children) === 1 && React.isValidElement(children) ? children : null;
    const controlId = onlyChild ? (onlyChild.props.id || autoId) : undefined;
    const renderedChild = onlyChild && !onlyChild.props.id
        ? React.cloneElement(onlyChild, { id: controlId })
        : children;
    return (
        <div className={cn("space-y-2", className)}>
            {label && <Label htmlFor={controlId}>{label}</Label>}
            {renderedChild}
            {error && <p className="text-xs text-state-error font-medium">{error}</p>}
        </div>
    );
};
