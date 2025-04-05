import React from 'react';

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'primary' | 'secondary' | 'destructive';
  animation?: 'border' | 'grow';
}

export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ size = 'md', variant = 'default', animation = 'border', className = '', ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-8 w-8',
    };
    
    const variantClasses = {
      default: 'text-gray-400',
      primary: 'text-primary',
      secondary: 'text-secondary',
      destructive: 'text-destructive',
    };
    
    const animationClasses = {
      border: `animate-spin rounded-full border-2 border-t-transparent`,
      grow: `animate-pulse rounded-full bg-current`,
    };
    
    return (
      <div
        className={`inline-block ${sizeClasses[size]} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
        role="status"
        ref={ref}
        {...props}
      >
        <span className="sr-only">Loading...</span>
      </div>
    );
  }
);

Spinner.displayName = 'Spinner';