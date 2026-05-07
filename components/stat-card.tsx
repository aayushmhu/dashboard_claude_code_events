import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  valueClassName?: string;
  loading?: boolean;
  children?: ReactNode;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  description,
  valueClassName,
  loading,
  children,
}: StatCardProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-4 w-24 mb-4" />
        <Skeleton className="h-9 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
      </Card>
    );
  }

  return (
    <Card className="hover:border-border/80 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <div className="rounded-md bg-muted p-1.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <p className={cn('text-3xl font-semibold tracking-tight', valueClassName)}>
          {value}
        </p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
