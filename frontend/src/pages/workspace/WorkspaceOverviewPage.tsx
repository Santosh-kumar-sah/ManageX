import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Video,
  CheckSquare,
  Activity,
  Plus,
  Users,
  Building2,
  Layers,
  CheckCircle2,
  Shield,
  Trophy,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiClient } from '@/api/client';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';

interface OrgModule {
  id: string;
  slug: string;
  name: string;
  description: string;
  isEnabled: boolean;
}

const MODULE_ICONS: Record<string, React.ElementType> = {
  events: Calendar,
  meetings: Video,
  projects: CheckSquare,
};

export function WorkspaceOverviewPage() {
  const { user } = useAuth();
  const { activeOrg, organisations } = useOrg();
  const [modules, setModules] = useState<OrgModule[]>([]);
  const [isLoadingModules, setIsLoadingModules] = useState(false);
  const [moduleError, setModuleError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrg?.id) return;

    let isMounted = true;
    setIsLoadingModules(true);
    setModuleError(null);

    apiClient<{ modules: OrgModule[] }>(`/organisations/${activeOrg.id}/modules`)
      .then((res) => {
        if (isMounted && res.data?.modules) {
          setModules(res.data.modules);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setModuleError(err instanceof Error ? err.message : 'Unable to load module status');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingModules(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeOrg?.id]);

  // Fallback defaults if modules list hasn't loaded yet
  const displayModules = modules.length > 0
    ? modules
    : [
        {
          id: 'events-default',
          slug: 'events',
          name: 'Events & Hackathons',
          description: 'Lifecycle management for general events and hackathons with team formation and blind judging.',
          isEnabled: true,
        },
        {
          id: 'meetings-default',
          slug: 'meetings',
          name: 'Meetings',
          description: 'Timezone-aware scheduling, structured agendas, confidential minutes, and assigned action items.',
          isEnabled: true,
        },
        {
          id: 'projects-default',
          slug: 'projects',
          name: 'Projects & Tasks',
          description: 'Project scopes, member assignments, task lifecycles, and synchronized List & Kanban views.',
          isEnabled: true,
        },
      ];

  if (!activeOrg && organisations.length === 0) {
    const isPlatformAdmin = Boolean(user?.isPlatformAdmin);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Workspace Overview</h1>
          <p className="text-xs text-slate-500 mt-1">
            {isPlatformAdmin
              ? 'Platform Administrator Console & Workspace'
              : 'Get started by creating your first organisation workspace.'}
          </p>
        </div>

        {isPlatformAdmin ? (
          <Card className="border-dashed border-indigo-200 bg-indigo-50/20">
            <CardContent className="p-10 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <Shield className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900">Platform Administrator Workspace</h2>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  You are currently signed in with platform administrative privileges without an active organisation selected. You can access the Operator Console or create a new organisation workspace.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <Link to="/platform">
                  <Button size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Shield className="h-4 w-4" />
                    <span>Open Operator Console</span>
                  </Button>
                </Link>
                <Link to="/app/organisations">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    <span>Create Organisation</span>
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed border-slate-300">
            <CardContent className="p-10 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
                <Building2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900">No Organisation Workspace</h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  You do not currently belong to any organisation workspace. If you are participating in an event or hackathon, access your participant dashboard. Otherwise, create your organisation below to start collaborating.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link to="/events/dashboard">
                  <Button size="sm" className="gap-2 bg-brand-600 hover:bg-brand-700 text-white">
                    <Trophy className="h-4 w-4" />
                    <span>Participant Dashboard</span>
                  </Button>
                </Link>
                <Link to="/events">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Browse Public Events</span>
                  </Button>
                </Link>
                <Link to="/app/organisations">
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-600">
                    <Plus className="h-4 w-4" />
                    <span>Create Organisation</span>
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const orgName = activeOrg?.name || 'Your Organisation';
  const roleName = activeOrg?.role?.name || 'Member';
  const memberCount = activeOrg?.memberCount ?? 1;

  return (
    <div className="space-y-8">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{orgName}</h1>
            <Badge variant="brand" className="text-[11px] font-medium">
              {roleName}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
            <span>Workspace Overview</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3 text-slate-400" />
              <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
            </span>
            <span>•</span>
            <span className="text-emerald-600 flex items-center gap-1 font-medium">
              <CheckCircle2 className="h-3 w-3" />
              <span>Active</span>
            </span>
          </p>
        </div>

        {/* Quick Action Shortcuts */}
        <div className="flex flex-wrap items-center gap-2">
          {activeOrg && (
            <>
              <Link to={`/app/organisations/${activeOrg.id}/events`}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  <span>Events</span>
                </Button>
              </Link>
              <Link to={`/app/organisations/${activeOrg.id}/meetings`}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Video className="h-3.5 w-3.5 text-slate-500" />
                  <span>Meetings</span>
                </Button>
              </Link>
              <Link to={`/app/organisations/${activeOrg.id}/projects`}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <CheckSquare className="h-3.5 w-3.5 text-slate-500" />
                  <span>Projects</span>
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {moduleError && (
        <Alert variant="error" className="py-2 text-xs">
          {moduleError}
        </Alert>
      )}

      {/* Modules Overview Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Active Modules</h2>
            <p className="text-xs text-slate-500">
              Operational tools enabled for this organization workspace.
            </p>
          </div>
          {activeOrg && (
            <Link
              to={`/app/organisations/${activeOrg.id}/modules`}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Manage Modules</span>
            </Link>
          )}
        </div>

        {isLoadingModules ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <Card key={n} className="border-border bg-white shadow-subtle p-5 space-y-3">
                <Skeleton className="h-9 w-9 rounded-md" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-8 w-full mt-2" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayModules.map((item) => {
              const Icon = MODULE_ICONS[item.slug] || Layers;
              const targetRoute = activeOrg
                ? `/app/organisations/${activeOrg.id}/${item.slug}`
                : '/app/organisations';

              return (
                <Card
                  key={item.id}
                  className="hover:border-slate-300 transition-all flex flex-col justify-between border-border bg-white shadow-subtle"
                >
                  <CardHeader className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="h-9 w-9 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
                        <Icon className="h-4 w-4" />
                      </div>
                      {item.isEnabled ? (
                        <Badge variant="success" className="text-[10px]">
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="neutral" className="text-[10px]">
                          Deactivated
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-sm font-bold text-slate-900">{item.name}</CardTitle>
                    <CardDescription className="text-xs mt-1.5 leading-relaxed text-slate-600">
                      {item.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 pt-0">
                    {item.isEnabled ? (
                      <Link to={targetRoute}>
                        <Button variant="outline" size="sm" className="w-full text-xs justify-center">
                          <span>Open {item.name.split(' ')[0]} Workspace</span>
                        </Button>
                      </Link>
                    ) : activeOrg ? (
                      <Link to={`/app/organisations/${activeOrg.id}/modules`}>
                        <Button variant="ghost" size="sm" className="w-full text-xs text-slate-500">
                          Enable in Settings
                        </Button>
                      </Link>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity Section — Honest, customer-friendly empty state */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Recent Workspace Activity</h2>
        <EmptyState
          icon={<Activity className="h-8 w-8 text-slate-400 stroke-1" />}
          title="No recent activity logged yet"
          description="Actions taken by your team across events, meetings, and projects will appear here."
        />
      </div>
    </div>
  );
}
