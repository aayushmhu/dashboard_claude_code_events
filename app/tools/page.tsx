import type { Metadata } from 'next';
import { Header } from '@/components/header';

export const metadata: Metadata = { title: 'Tools' };
import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToolUsageBar } from '@/components/charts/tool-usage-bar';
import { ToolStats } from '@/lib/types';
import { Wrench, Hash, AlertTriangle, Zap } from 'lucide-react';
import { formatRelativeTime, formatMs } from '@/lib/utils';
import Link from 'next/link';

async function getData() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const tools = await fetch(`${base}/api/tools`, { cache: 'no-store' }).then((r) => r.json());
  return tools as ToolStats[];
}

export default async function ToolsPage() {
  const tools = await getData();

  const totalCalls = tools.reduce((s, t) => s + t.total_calls, 0);
  const totalErrors = tools.reduce((s, t) => s + t.error_count, 0);
  const overallErrorRate = totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(1) : '0';
  const topTool = tools[0]?.tool_name || '—';

  return (
    <div className="flex flex-col h-full">
      <Header title="Tools" />
      <div className="flex-1 p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Tool Calls" value={totalCalls.toLocaleString()} icon={Hash} />
          <StatCard label="Unique Tools" value={tools.length} icon={Wrench} />
          <StatCard label="Error Rate" value={`${overallErrorRate}%`} icon={AlertTriangle} />
          <StatCard label="Most Used" value={topTool} icon={Zap} />
        </div>

        {/* Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tool Usage (all time)</CardTitle>
          </CardHeader>
          <CardContent>
            <ToolUsageBar data={tools} />
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tool Details</CardTitle>
          </CardHeader>
          <CardContent>
            {tools.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No tool usage recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="pb-3 pr-6 font-medium">Tool</th>
                      <th className="pb-3 pr-6 font-medium text-right">Calls</th>
                      <th className="pb-3 pr-6 font-medium text-right">Errors</th>
                      <th className="pb-3 pr-6 font-medium text-right">Error Rate</th>
                      <th className="pb-3 pr-6 font-medium text-right">Avg Duration</th>
                      <th className="pb-3 pr-6 font-medium text-right">Max Duration</th>
                      <th className="pb-3 font-medium">Last Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((tool) => (
                      <tr key={tool.tool_name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-3 pr-6">
                          <Link
                            href={`/tools/${encodeURIComponent(tool.tool_name)}`}
                            className="font-medium hover:text-primary transition-colors"
                          >
                            {tool.tool_name}
                          </Link>
                        </td>
                        <td className="py-3 pr-6 text-right text-muted-foreground">{tool.total_calls.toLocaleString()}</td>
                        <td className="py-3 pr-6 text-right text-muted-foreground">
                          {tool.error_count > 0 ? (
                            <Link
                              href={`/tools/${encodeURIComponent(tool.tool_name)}?errors_only=true`}
                              className="text-destructive hover:underline"
                            >
                              {tool.error_count}
                            </Link>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="py-3 pr-6 text-right">
                          {tool.error_rate > 0 ? (
                            <span className="text-destructive">{tool.error_rate}%</span>
                          ) : (
                            <span className="text-muted-foreground">0%</span>
                          )}
                        </td>
                        <td className="py-3 pr-6 text-right text-muted-foreground">
                          {tool.avg_duration_ms > 0 ? formatMs(tool.avg_duration_ms) : '—'}
                        </td>
                        <td className="py-3 pr-6 text-right text-muted-foreground">
                          {tool.max_duration_ms > 0 ? formatMs(tool.max_duration_ms) : '—'}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {formatRelativeTime(tool.last_used)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
