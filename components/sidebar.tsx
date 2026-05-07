'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  List,
  Wrench,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Coins,
  Zap,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const navItems = [
  {
    href: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    gradient: 'from-blue-500/20 to-blue-500/0',
    border: 'border-blue-500/50',
  },
  {
    href: '/chat',
    label: 'Chat',
    icon: Terminal,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    gradient: 'from-cyan-500/20 to-cyan-500/0',
    border: 'border-cyan-500/50',
  },
  {
    href: '/projects',
    label: 'Projects',
    icon: FolderOpen,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    gradient: 'from-emerald-500/20 to-emerald-500/0',
    border: 'border-emerald-500/50',
  },
  {
    href: '/sessions',
    label: 'Sessions',
    icon: List,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    gradient: 'from-violet-500/20 to-violet-500/0',
    border: 'border-violet-500/50',
  },
  {
    href: '/tools',
    label: 'Tools',
    icon: Wrench,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    gradient: 'from-amber-500/20 to-amber-500/0',
    border: 'border-amber-500/50',
  },
  {
    href: '/tokens',
    label: 'Tokens',
    icon: Coins,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    gradient: 'from-yellow-500/20 to-yellow-500/0',
    border: 'border-yellow-500/50',
  },
  {
    href: '/errors',
    label: 'Errors',
    icon: AlertCircle,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    gradient: 'from-rose-500/20 to-rose-500/0',
    border: 'border-rose-500/50',
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r border-border bg-card/60 backdrop-blur-xl transition-all duration-300 ease-in-out',
        collapsed ? 'w-[60px]' : 'w-[220px]'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex h-14 items-center border-b border-border/60',
        collapsed ? 'justify-center px-0' : 'px-4 gap-3'
      )}>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
          <Zap className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none truncate">Claude Code</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Analytics</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon, color, bg, gradient, border }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-all duration-200 relative',
                isActive
                  ? `bg-gradient-to-r ${gradient} border-l-2 ${border} pl-[calc(0.625rem-2px)] font-medium`
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border-l-2 border-transparent'
              )}
            >
              <div className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200',
                isActive ? bg : 'group-hover:bg-white/5'
              )}>
                <Icon className={cn('h-3.5 w-3.5 transition-colors', isActive ? color : 'text-muted-foreground group-hover:text-foreground')} />
              </div>
              {!collapsed && (
                <span className="truncate text-[13px]">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-border/60">
          <p className="text-[10px] text-muted-foreground/50 font-mono">claude.ai/code</p>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-[3.25rem] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-md hover:border-primary/30 hover:text-primary transition-all z-10"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>
    </aside>
  );
}
