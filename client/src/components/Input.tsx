import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  labelAction?: React.ReactNode;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, labelAction, error, icon, className = '', ...props }) => {
  return (
    <div className="w-full">
      {(label || labelAction) && (
        <div className="flex justify-between items-center mb-1">
          {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
          {labelAction}
        </div>
      )}
      <div className="relative">
          {icon && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center justify-center">
                  {icon}
              </div>
          )}
          <input
            className={`w-full ${icon ? 'pl-10' : 'px-3'} py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow ${
              error ? 'border-red-500' : 'border-slate-300'
            } ${className}`}
            {...props}
          />
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
};

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; labelAction?: React.ReactNode }> = ({ label, labelAction, className = '', ...props }) => {
  return (
    <div className="w-full">
      {(label || labelAction) && (
        <div className="flex justify-between items-center mb-1">
          {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
          {labelAction}
        </div>
      )}
      <textarea
        className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow ${className}`}
        {...props}
      />
    </div>
  );
};
