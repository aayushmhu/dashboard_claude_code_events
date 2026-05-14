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
  MessageSquare,
  Menu,
  X,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const navItems = [
  { href: '/',              label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/chat',          label: 'Chat',          icon: Terminal, experimental: true },
  { href: '/projects',      label: 'Projects',      icon: FolderOpen },
  { href: '/sessions',      label: 'Sessions',      icon: List },
  { href: '/tools',         label: 'Tools',         icon: Wrench },
  { href: '/tokens',        label: 'Tokens',        icon: Coins },
  { href: '/errors',        label: 'Errors',        icon: AlertCircle },
  { href: '/model-pricing', label: 'Model Pricing', icon: DollarSign },
];

export function HamburgerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed top-3.5 left-3.5 z-50 flex md:hidden h-7 w-7 items-center justify-center rounded-lg border border-border bg-card shadow-md hover:border-primary/30 hover:text-primary transition-all"
      aria-label="Open sidebar"
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Collapse on /chat and /conversations; elsewhere follow screen size
  useEffect(() => {
    if (pathname.startsWith('/chat') || pathname.startsWith('/conversations')) {
      setCollapsed(true);
      return;
    }
    const mq = window.matchMedia('(min-width: 1024px)');
    setCollapsed(!mq.matches);
    const handler = (e: MediaQueryListEvent) => setCollapsed(!e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [pathname]);

  // Close mobile overlay on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  return (
    <>
      {/* Hamburger — mobile only */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3.5 left-3.5 z-50 flex md:hidden h-7 w-7 items-center justify-center rounded-lg border border-border bg-card shadow-md hover:border-primary/30 hover:text-primary transition-all"
        aria-label="Open sidebar"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-border bg-card/60 backdrop-blur-xl transition-all duration-300 ease-in-out',
          // Mobile: fixed overlay, hidden unless open
          'fixed inset-y-0 left-0 z-40 md:relative md:inset-auto md:z-auto',
          // Mobile open/closed
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          // Width
          collapsed ? 'w-[60px]' : 'w-[220px]'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex h-14 items-center border-b border-border/60',
          collapsed ? 'justify-center px-0' : 'px-4 gap-3'
        )}>
          <Link href="/" onClick={handleNavClick} className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0 hover:opacity-90 transition-opacity">
            <Zap className="h-4 w-4 text-white" />
          </Link>
          {!collapsed && (
            <Link href="/" onClick={handleNavClick} className="min-w-0 flex-1 hover:opacity-80 transition-opacity">
              <p className="text-sm font-semibold leading-none truncate">Claude Code</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Analytics</p>
            </Link>
          )}
          {/* Close button — mobile only */}
          {!collapsed && (
            <button
              onClick={() => setMobileOpen(false)}
              className="md:hidden ml-auto shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label="Close sidebar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon, experimental }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            const link = (
              <Link
                key={href}
                href={href}
                onClick={handleNavClick}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150 border-l-2',
                  isActive
                    ? 'border-primary bg-primary/5 text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0 transition-colors', isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')} />
                {!collapsed && (
                  <span className="truncate text-[13px] flex items-center gap-1.5">
                    {label}
                    {experimental && (
                      <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/20 leading-none shrink-0">
                        EXP
                      </span>
                    )}
                  </span>
                )}
              </Link>
            );

            return collapsed ? (
              <Tooltip key={href} delayDuration={100}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className="flex items-center gap-1.5">
                  {label}
                  {experimental && (
                    <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/20 leading-none">
                      EXP
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            ) : link;
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-border/60">
            <p className="text-[10px] text-muted-foreground/50 font-mono">claude.ai/code</p>
          </div>
        )}

        {/* Collapse toggle — desktop/tablet only */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-[3.25rem] hidden md:flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-md hover:border-primary/30 hover:text-primary transition-all z-10"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>
      </aside>
    </>
  );
}
