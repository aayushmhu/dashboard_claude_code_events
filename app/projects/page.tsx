import type { Metadata } from 'next';
import { Header } from '@/components/header';

export const metadata: Metadata = { title: 'Projects' };
import { ProjectCard } from '@/components/project-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectStats, ToolStats } from '@/lib/types';

async function getData() {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const [projects, tools] = await Promise.all([
    fetch(`${base}/api/projects`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
    fetch(`${base}/api/tools`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
  ]);
  return { projects, tools };
}

export default async function ProjectsPage() {
  const { projects, tools } = (await getData()) as {
    projects: ProjectStats[];
    tools: ToolStats[];
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Projects" />
      <div className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:p-6 space-y-4 sm:space-y-6">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <FolderEmptyIcon />
            <p className="mt-4 text-sm">No projects found</p>
            <p className="text-xs">Start a Claude Code session to see your projects here.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map((p) => (
                <ProjectCard key={p.project_dir} project={p} />
              ))}
            </div>

            {tools.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Overall Tool Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Tool</th>
                          <th className="pb-2 pr-4 font-medium">Total Calls</th>
                          <th className="pb-2 pr-4 font-medium">Errors</th>
                          <th className="pb-2 pr-4 font-medium">Error Rate</th>
                          <th className="pb-2 font-medium">Avg Output Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tools.map((t) => (
                          <tr key={t.tool_name} className="border-b border-border/50">
                            <td className="py-2.5 pr-4 font-medium">{t.tool_name}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{t.total_calls}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{t.error_count}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">
                              {t.error_rate > 0 ? (
                                <span className="text-destructive">{t.error_rate}%</span>
                              ) : (
                                '0%'
                              )}
                            </td>
                            <td className="py-2.5 text-muted-foreground">{t.avg_output_size}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FolderEmptyIcon() {
  return (
    <svg
      className="h-12 w-12 text-muted-foreground/40"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
      />
    </svg>
  );
}
