import React, { useState } from 'react';

// Alert component
interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'light' | 'dark';
  dismissible?: boolean;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({ 
  variant, 
  dismissible = false, 
  onClose, 
  children, 
  className, 
  ...props 
}) => {
  const [visible, setVisible] = useState(true);

  const handleClose = () => {
    setVisible(false);
    if (onClose) onClose();
  };

  if (!visible) return null;

  return (
    <div 
      className={`alert alert-${variant} ${dismissible ? 'alert-dismissible fade show' : ''} ${className || ''}`} 
      role="alert"
      {...props}
    >
      {children}
      {dismissible && (
        <button 
          type="button" 
          className="btn-close" 
          aria-label="Close"
          onClick={handleClose}
        ></button>
      )}
    </div>
  );
};

// Card component
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card: React.FC<CardProps> = ({ children, className, ...props }) => {
  return (
    <div className={`card ${className || ''}`} {...props}>
      {children}
    </div>
  );
};

// Card.Header component
interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardHeader: React.FC<CardHeaderProps> = ({ children, className, ...props }) => {
  return (
    <div className={`card-header ${className || ''}`} {...props}>
      {children}
    </div>
  );
};

// Card.Body component
interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardBody: React.FC<CardBodyProps> = ({ children, className, ...props }) => {
  return (
    <div className={`card-body ${className || ''}`} {...props}>
      {children}
    </div>
  );
};

// Card.Footer component
interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardFooter: React.FC<CardFooterProps> = ({ children, className, ...props }) => {
  return (
    <div className={`card-footer ${className || ''}`} {...props}>
      {children}
    </div>
  );
};

// Attach subcomponents to Card
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

// Button component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'light' | 'dark' | 'link' | 'outline-primary' | 'outline-secondary' | 'outline-success' | 'outline-danger' | 'outline-warning' | 'outline-info' | 'outline-light' | 'outline-dark';
  size?: 'sm' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  size, 
  children, 
  className, 
  ...props 
}) => {
  return (
    <button 
      className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className || ''}`} 
      {...props}
    >
      {children}
    </button>
  );
};

// Badge component
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  bg: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'light' | 'dark';
  pill?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ 
  bg, 
  pill = false, 
  children, 
  className, 
  ...props 
}) => {
  return (
    <span 
      className={`badge bg-${bg} ${pill ? 'rounded-pill' : ''} ${className || ''}`} 
      {...props}
    >
      {children}
    </span>
  );
};

// Spinner component
interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  animation: 'border' | 'grow';
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'light' | 'dark';
  size?: 'sm';
}

export const Spinner: React.FC<SpinnerProps> = ({ 
  animation, 
  variant = 'primary', 
  size, 
  className, 
  ...props 
}) => {
  return (
    <div 
      className={`spinner-${animation} text-${variant} ${size ? `spinner-${animation}-${size}` : ''} ${className || ''}`} 
      role="status"
      {...props}
    >
      <span className="visually-hidden">Loading...</span>
    </div>
  );
};

export { Card };

// Export other Bootstrap components as needed