import React from 'react';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
  className?: string;
}

export const Label: React.FC<LabelProps> = ({ children, className = '', ...props }) => {
  const baseClasses = 'text-sm font-medium text-gray-700';
  
  return (
    <label className={`${baseClasses} ${className}`} {...props}>
      {children}
    </label>
  );
};
