import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Video, CheckSquare, Activity, CheckCircle, Server, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { apiClient } from '@/api/client';

interface HealthData {
  status: string;
  uptimeSeconds: number;
  timestamp: string;
}

export function WorkspaceOverviewPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  async function fetchHealth() {
    setIsLoadingHealth(true);
    setHealthError(null);
    try {
      const res = await apiClient<HealthData>('/health');
      if (res.data) {
        setHealth(res.data);
      }
    } catch (err: unknown) {
      setHealthError(err instanceof Error ? err.message : 'Failed to reach backend API');
    } finally {
      setIsLoadingHealth(false);
    }
  }

  useEffect(() => {
    fetchHealth();
  }, []);

  const modules = [
    {
      title: 'Events & Hackathons',
      status: 'Scheduled for Phase 6',
      description: 'Event lifecycles, external participant registrations, URL submissions, and assigned judging.',
      href: '/app/organisations/demo-org/events',
      icon: Calendar,
      phase: 'Phase 6',
    },
    {
      title: 'Meetings',
      status: 'Scheduled for Phase 7',
      description: 'Timezone-aware scheduling, ordered agendas, confidential minutes, and action items.',
      href: '/app/organisations/demo-org/meetings',
      icon: Video,
      phase: 'Phase 7',
    },
    {
      title: 'Projects & Tasks',
      status: 'Scheduled for Phase 8',
      description: 'Project scopes, member assignments, task lifecycles, and synchronized List & Kanban views.',
      href: '/app/organisations/demo-org/projects',
      icon: CheckSquare,
      phase: 'Phase 8',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Workspace Overview</h1>
          <p className="text-xs text-slate-500 mt-1">
            Active Organisation: <strong className="text-slate-700">Acme Enterprise</strong> • Clean Enterprise Shell
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchHealth} isLoading={isLoadingHealth} className="gap-1.5 self-start">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh API Status</span>
        </Button>
      </div>

      {/* Backend API Connectivity Probe Banner */}
      <Card className="border-brand-100 bg-brand-50/30">
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-white border border-brand-200 flex items-center justify-center text-brand-600 shadow-xs shrink-0">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span>Express API Probe</span>
                {health ? (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle className="h-3 w-3" /> Online
                  </Badge>
                ) : isLoadingHealth ? (
                  <Badge variant="neutral">Probing...</Badge>
                ) : (
                  <Badge variant="danger">Unreachable</Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {health
                  ? `Base path /api/v1 • Uptime: ${health.uptimeSeconds}s • Server timestamp: ${new Date(health.timestamp).toLocaleTimeString()}`
                  : 'Probing /api/v1/health via same-origin reverse proxy...'}
              </p>
            </div>
          </div>

          {healthError && (
            <Alert variant="error" className="py-2 text-xs">
              {healthError}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Modules Overview */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Module Entitlements</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modules.map((item) => (
            <Card key={item.title} className="hover:border-slate-300 transition-all flex flex-col justify-between">
              <CardHeader className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-9 w-9 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <Badge variant="neutral">{item.phase}</Badge>
                </div>
                <CardTitle className="text-sm font-semibold">{item.title}</CardTitle>
                <CardDescription className="text-xs mt-1 leading-relaxed">
                  {item.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <Link to={item.href}>
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    View Placeholder Shell
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Activity Section — Honest empty state, strictly zero fake data */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Recent Workspace Activity</h2>
        <EmptyState
          icon={<Activity className="h-8 w-8 text-slate-400 stroke-1" />}
          title="No recent activity logged yet"
          description="Real workspace actions, audit events, and notifications will be logged once business modules are activated in subsequent phases."
        />
      </div>
    </div>
  );
}
