
import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
  handleError: (error: any) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const getFriendlyErrorMessage = (error: any): string => {
    // 1. Safely extract the string message
    let msg = '';
    
    if (typeof error === 'string') {
        msg = error;
    } else if (error instanceof Error) {
        msg = error.message;
    } else if (error && typeof error === 'object') {
        // Handle API/Socket objects that might have { error: "..." }
        msg = error.error || error.message || 'Unknown error occurred';
    } else {
        msg = 'An unexpected error occurred';
    }

    // 2. Normalize for comparison
    const lowerMsg = String(msg).toLowerCase();
    
    // 3. Match specific cases
    if (lowerMsg.includes('quota') || lowerMsg.includes('full') || lowerMsg.includes('space') || lowerMsg.includes('exceeded')) {
        return "Storage Full: You have reached your storage limit.";
    }
    if (lowerMsg.includes('permission') || lowerMsg.includes('access') || lowerMsg.includes('unauthorized') || lowerMsg.includes('denied') || lowerMsg.includes('403')) {
        return "Access Denied: You don't have permission to perform this action.";
    }
    if (lowerMsg.includes('413') || lowerMsg.includes('large')) {
        return "File Too Large: The file exceeds the upload limit.";
    }
    if (lowerMsg.includes('network') || lowerMsg.includes('failed to fetch') || lowerMsg.includes('connection')) {
        return "Connection Error: Please check your internet connection.";
    }
    
    // Return the original message if no map found (capitalized)
    return msg.charAt(0).toUpperCase() + msg.slice(1);
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto dismiss
    setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const handleError = useCallback((error: any) => {
      // We suppressed the console.error here to avoid "Global Error Caught" spam
      // The user will still see the friendly toast message.
      showToast(getFriendlyErrorMessage(error), 'error');
  }, [showToast]);

  const removeToast = (id: string) => {
      setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, handleError }}>
      {children}
      
      {/* Toast Container */}
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[100] flex flex-col gap-3 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map(toast => (
            <div 
                key={toast.id} 
                className={`pointer-events-auto bg-white/95 backdrop-blur-md px-4 py-3.5 rounded-2xl shadow-soft border flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
                toast.type === 'success' ? 'border-green-100 text-green-900' :
                toast.type === 'error' ? 'border-red-100 text-red-900' :
                'border-blue-100 text-blue-900'
            }`}>
                <div className={`mt-0.5 ${
                    toast.type === 'success' ? 'text-green-500' :
                    toast.type === 'error' ? 'text-red-500' :
                    'text-blue-500'
                }`}>
                    {toast.type === 'success' && <CheckCircle2 size={18} />}
                    {toast.type === 'error' && <AlertCircle size={18} />}
                    {toast.type === 'info' && <Info size={18} />}
                </div>
                <div className="flex-1 text-sm font-medium leading-tight pt-0.5 break-words">
                    {toast.message}
                </div>
                <button 
                    onClick={() => removeToast(toast.id)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X size={16} />
                </button>
            </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
