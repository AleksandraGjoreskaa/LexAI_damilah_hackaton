import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, FileText, Scale, Menu, X, Database, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Разговор', icon: MessageSquare, description: 'AI правен асистент' },
  { to: '/search', label: 'Пребарување', icon: Search, description: 'Директно во законите' },
  { to: '/documents', label: 'Документи', icon: FileText, description: 'Управување со закони' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full bg-primary-950 text-white">
          {/* Brand */}
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-500/20 border border-accent-500/30">
                <Scale className="h-5 w-5 text-accent-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">LexAI</h1>
                <p className="text-xs text-primary-300">Правен AI Асистент</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 space-y-1">
            {navItems.map(({ to, label, icon: Icon, description }) => {
              const isActive = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-white/10 text-white shadow-lg shadow-black/10'
                      : 'text-primary-200 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <Icon className={cn('h-5 w-5', isActive ? 'text-accent-400' : '')} />
                  <div>
                    <div>{label}</div>
                    <div className={cn('text-xs', isActive ? 'text-primary-200' : 'text-primary-400')}>
                      {description}
                    </div>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Footer stats */}
          <div className="p-4 mx-4 mb-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 text-xs text-primary-300">
              <Database className="h-3.5 w-3.5" />
              <span>3,798 правни сегменти</span>
            </div>
            <p className="text-xs text-primary-400 mt-1">
              30 закони • Македонско право
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Menu className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary-600" />
            <span className="font-semibold text-gray-900">LexAI</span>
          </div>
        </div>

        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
