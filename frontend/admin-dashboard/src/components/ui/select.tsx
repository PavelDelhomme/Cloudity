import React, { useState, useRef, useEffect } from 'react';

interface SelectProps {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({ 
  children, 
  value, 
  onValueChange, 
  disabled = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value || '');
  const selectRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  return (
    <div className="relative" ref={selectRef}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            isOpen,
            setIsOpen,
            selectedValue,
            setSelectedValue,
            onValueChange,
            disabled
          } as any);
        }
        return child;
      })}
    </div>
  );
};

interface SelectTriggerProps {
  children: React.ReactNode;
  className?: string;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
  disabled?: boolean;
}

export const SelectTrigger: React.FC<SelectTriggerProps> = ({ 
  children, 
  className = '',
  isOpen,
  setIsOpen,
  disabled = false
}) => (
  <button
    className={`flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    onClick={() => !disabled && setIsOpen?.(!isOpen)}
    disabled={disabled}
  >
    {children}
  </button>
);

interface SelectValueProps {
  placeholder?: string;
  selectedValue?: string;
}

export const SelectValue: React.FC<SelectValueProps> = ({ 
  placeholder = "Select an option...",
  selectedValue
}) => (
  <span className={selectedValue ? 'text-gray-900' : 'text-gray-500'}>
    {selectedValue || placeholder}
  </span>
);

interface SelectContentProps {
  children: React.ReactNode;
  isOpen?: boolean;
  className?: string;
}

export const SelectContent: React.FC<SelectContentProps> = ({ 
  children, 
  isOpen = false,
  className = ''
}) => {
  if (!isOpen) return null;
  
  return (
    <div className={`absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-gray-200 bg-white p-1 shadow-md ${className}`}>
      {children}
    </div>
  );
};

interface SelectItemProps {
  children: React.ReactNode;
  value: string;
  className?: string;
  selectedValue?: string;
  setSelectedValue?: (value: string) => void;
  setIsOpen?: (open: boolean) => void;
  onValueChange?: (value: string) => void;
}

export const SelectItem: React.FC<SelectItemProps> = ({ 
  children, 
  value, 
  className = '',
  selectedValue,
  setSelectedValue,
  setIsOpen,
  onValueChange
}) => {
  const isSelected = selectedValue === value;
  
  const handleClick = () => {
    setSelectedValue?.(value);
    onValueChange?.(value);
    setIsOpen?.(false);
  };
  
  return (
    <button
      className={`relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-gray-100 focus:bg-gray-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${isSelected ? 'bg-gray-100' : ''} ${className}`}
      onClick={handleClick}
    >
      {isSelected && (
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          ✓
        </span>
      )}
      {children}
    </button>
  );
};
