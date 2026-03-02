import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { api } from '../services/api';
import smartAuditLogo from '../assets/smartaudit_transparent_logo.png';

interface SetupPageProps {
  onComplete: () => void;
}

export default function SetupPage({ onComplete }: SetupPageProps) {
  const { createSuperAdmin, loading, error: storeError } = useAuthStore();
  const [step, setStep] = useState<'login' | 'ip'>('login');

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  // IP Server state
  const [ipServer, setIpServer] = useState(api.getBaseUrl().replace(/^https?:\/\//, ''));
  const [ipTesting, setIpTesting] = useState(false);
  const [ipMessage, setIpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !password || !licenseKey) {
      setError('All fields are required');
      return;
    }

    if (licenseKey.trim().length === 0) {
      setError('License key is required');
      return;
    }

    const success = await createSuperAdmin(username, password, username);

    if (success) {
      setStep('ip');
    }
  };

  const handleTestConnection = async () => {
    setIpTesting(true);
    setIpMessage(null);
    try {
      const ip = ipServer.replace(/\/+$/, '');
      const url = ip.startsWith('http') ? ip : `http://${ip}`;
      const res = await fetch(`${url}/api/health`, { method: 'GET' }).catch(() => null);
      if (res && res.ok) {
        setIpMessage({ type: 'success', text: 'Connection successful!' });
      } else {
        setIpMessage({ type: 'error', text: 'Cannot connect to server' });
      }
    } catch {
      setIpMessage({ type: 'error', text: 'Cannot connect to server' });
    } finally {
      setIpTesting(false);
    }
  };

  const handleSaveIp = () => {
    const ip = ipServer.replace(/\/+$/, '');
    const url = ip.startsWith('http') ? ip : `http://${ip}`;
    api.setBaseUrl(url);
    onComplete();
  };

  const displayError = error || storeError;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-brand-navy to-gray-900 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-blue/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-brand-cyan/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            step === 'login' ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/30' : 'bg-green-900/30 text-green-400 border border-green-800/30'
          }`}>
            {step === 'ip' ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <span className="w-4 text-center">1</span>
            )}
            Sign In
          </div>
          <div className="w-6 h-px bg-slate-600"></div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            step === 'ip' ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/30' : 'bg-slate-700/50 text-slate-500 border border-slate-700'
          }`}>
            <span className="w-4 text-center">2</span>
            IP Server
          </div>
        </div>

        <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-slate-700">
          {/* Logo */}
          <div className="text-center mb-8">
            <img
              src={smartAuditLogo}
              alt="SmartAudit"
              className="h-20 mx-auto mb-4 brightness-0 invert"
            />
            <p className="text-slate-400">{step === 'login' ? 'Initial Setup' : 'IP Server Configuration'}</p>
          </div>

          {/* Step 1: Login */}
          {step === 'login' && (
            <>
              {/* Error message */}
              {displayError && (
                <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg flex items-center gap-2">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm text-red-400">{displayError}</p>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-5">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1.5">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoComplete="username"
                      className="w-full pl-10 pr-4 py-3 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-all"
                      placeholder="Enter your username"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full pl-10 pr-4 py-3 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-all"
                      placeholder="Enter your password"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="licenseKey" className="block text-sm font-medium text-slate-300 mb-1.5">
                    License Key
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </div>
                    <input
                      id="licenseKey"
                      type="text"
                      value={licenseKey}
                      onChange={(e) => setLicenseKey(e.target.value)}
                      required
                      autoComplete="off"
                      className="w-full pl-10 pr-4 py-3 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-all font-mono tracking-wider"
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-brand-blue text-white font-medium rounded-lg hover:bg-brand-cyan focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>
            </>
          )}

          {/* Step 2: IP Server */}
          {step === 'ip' && (
            <div className="space-y-5">
              <p className="text-sm text-slate-400">
                Configure the backend IP server that this application connects to.
              </p>

              <div>
                <label htmlFor="ipServer" className="block text-sm font-medium text-slate-300 mb-1.5">
                  IP Server
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                  </div>
                  <input
                    id="ipServer"
                    type="text"
                    value={ipServer}
                    onChange={(e) => setIpServer(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-all font-mono text-sm"
                    placeholder="192.168.1.100:8080"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Default: {api.getDefaultUrl().replace(/^https?:\/\//, '')}
                </p>
              </div>

              {/* Test connection button */}
              <button
                onClick={handleTestConnection}
                disabled={ipTesting || !ipServer.trim()}
                className="w-full py-2.5 px-4 bg-slate-600 text-slate-200 font-medium rounded-lg hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
              >
                {ipTesting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </button>

              {ipMessage && (
                <p className={`text-sm text-center ${ipMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {ipMessage.text}
                </p>
              )}

              {/* Save & Continue */}
              <button
                onClick={handleSaveIp}
                disabled={!ipServer.trim()}
                className="w-full py-3 px-4 bg-brand-blue text-white font-medium rounded-lg hover:bg-brand-cyan focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Save & Continue
              </button>

            </div>
          )}

          {/* Security badge */}
          <div className="mt-6 pt-4 border-t border-slate-700">
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
              <svg className="w-4 h-4 text-brand-cyan" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Authorized personnel only</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-white/80 text-sm">SmartClick Solution Co., Ltd.</p>
          <p className="text-white/50 text-xs mt-1">Version 1.0.0</p>
        </div>
      </div>
    </div>
  );
}
