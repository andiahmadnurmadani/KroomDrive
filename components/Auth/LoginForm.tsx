
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2, Cloud } from 'lucide-react';
import { KroomLogo } from '../Icons';

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7FE] p-4 font-sans">
      <div className="bg-white rounded-[30px] shadow-soft overflow-hidden w-full max-w-[1100px] flex min-h-[600px]">
        
        {/* Left Side - Form */}
        <div className="w-full lg:w-1/2 p-8 md:p-12 flex flex-col justify-center relative bg-white">
          <div className="mb-10 text-center">
            <div className="flex justify-center mb-6">
                 <KroomLogo className="w-24 h-24 text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-secondary mb-2">KroomDrive Access</h1>
            <p className="text-gray-400 text-sm font-medium">Enter your credentials to access the file system</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 max-w-sm mx-auto w-full">
            <div>
              <label className="block text-sm font-bold text-secondary mb-2">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-5 py-4 bg-transparent border border-gray-200 rounded-2xl focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-all text-secondary text-sm font-medium placeholder-gray-400"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-secondary mb-2">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 bg-transparent border border-gray-200 rounded-2xl focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-all text-secondary text-sm font-medium placeholder-gray-400"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-500 text-xs font-bold border border-red-100 flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                 <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></div>
                {error}
              </div>
            )}

            <div className="pt-4">
                <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3.5 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold shadow-lg shadow-primary-600/20 flex items-center justify-center gap-2 transition-all transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                {isLoggingIn && <Loader2 size={18} className="animate-spin" />}
                {isLoggingIn ? 'Authenticating...' : 'Sign In'}
                </button>
            </div>
          </form>
        </div>

        {/* Right Side - Visual */}
        <div className="hidden lg:flex w-1/2 bg-primary-600 relative items-center justify-center overflow-hidden">
             {/* Gradient Background */}
             <div className="absolute inset-0 bg-gradient-to-br from-primary-600 to-indigo-800"></div>
             
             {/* Abstract Shapes/Pattern Overlay */}
             <div className="absolute inset-0 opacity-10" 
                  style={{
                      backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', 
                      backgroundSize: '40px 40px'
                  }}>
             </div>
             
             {/* Main Content */}
             <div className="relative z-10 p-12 text-center text-white flex flex-col items-center">
                {/* Floating 3D-ish Icon Container */}
                <div className="w-28 h-28 bg-white/10 backdrop-blur-xl rounded-[30px] flex items-center justify-center mb-8 border border-white/20 shadow-2xl rotate-6 hover:rotate-0 transition-transform duration-700 ease-out cursor-default">
                    <Cloud size={56} className="text-white drop-shadow-md" strokeWidth={1.5} />
                </div>

                <h2 className="text-3xl font-bold mb-6 tracking-tight">Centralized Storage<br/>Control Panel</h2>
                <p className="text-primary-100/90 text-lg max-w-md mx-auto leading-relaxed font-medium">
                    High-performance interface for managing your remote file systems and storage quotas securely.
                </p>

                {/* Decorative Bottom Shape */}
                <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
                <div className="absolute -top-20 -right-20 w-80 h-80 bg-indigo-500/30 rounded-full blur-3xl"></div>
             </div>
        </div>
      </div>
    </div>
  );
};
