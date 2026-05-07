import { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  valueClassName?: string;
  iconClassName?: string;
  loading?: boolean;
  children?: ReactNode;
  trend?: { value: number; label?: string };
}

export function StatCard({
  label,
  value,
  icon: Icon,
  description,
  valueClassName,
  iconClassName,
  loading,
  children,
  trend,
}: StatCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  const trendPositive = trend && trend.value >= 0;

  return (
    <div className="card-hover-glow relative rounded-xl border border-border bg-card overflow-hidden group transition-all duration-300">
      {/* Top accent line */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center ring-1 ring-inset transition-colors duration-300',
            'bg-primary/10 ring-primary/20 group-hover:bg-primary/15 group-hover:ring-primary/30',
            iconClassName
          )}>
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>

        <p className={cn(
          'text-[2rem] font-bold leading-none tracking-tight font-mono-num',
          valueClassName
        )}>
          {value}
        </p>

        <div className="mt-2 flex items-center gap-2">
          {description && (
            <p className="text-xs text-muted-foreground/70">{description}</p>
          )}
          {trend && (
            <span className={cn(
              'text-xs font-medium ml-auto',
              trendPositive ? 'text-emerald-400' : 'text-rose-400'
            )}>
              {trendPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              {trend.label && <span className="text-muted-foreground/60 font-normal ml-1">{trend.label}</span>}
            </span>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}
