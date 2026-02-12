import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/live': 'Live Monitor',
  '/sessions': 'Session History',
  '/users': 'User Management',
  '/servers': 'Server Management',
  '/settings': 'Settings',
};

export default function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'SmartAudit';

  return (
    <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">{title}</h1>
      </div>
    </header>
  );
}
