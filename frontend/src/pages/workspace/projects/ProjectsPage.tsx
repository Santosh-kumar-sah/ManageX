import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import {
  FolderKanban,
  Plus,
  Search,

  ArrowRight,



  ShieldAlert,
} from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';
import {
  ProjectItem,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_VARIANTS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_PRIORITY_VARIANTS,
} from '@/types/projects';
import './projects.css';
import { CreateProjectDialog } from './CreateProjectDialog';

export function ProjectsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { activeOrg, activeDetails } = useOrg();

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const canCreateProject =
    activeDetails?.membership?.permissions?.includes('project.create') ||
    activeDetails?.membership?.role?.slug === 'organisation_owner' ||
    activeDetails?.membership?.role?.slug === 'organisation_admin' ||
    activeDetails?.membership?.role?.slug === 'project_admin';

  const fetchProjects = useCallback(async () => {
    if (!effectiveOrgId) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setAccessDenied(null);

      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await apiClient<{ projects: ProjectItem[] }>(
        `/organisations/${effectiveOrgId}/projects${queryString}`
      );

      if (res.data) {
        setProjects(res.data.projects || []);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 403 || err.statusCode === 401) {
          setAccessDenied(err.message || 'Access to organisation projects is restricted to active members.');
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg('Failed to load organisation projects.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOrgId, searchQuery, statusFilter, priorityFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  function formatDate(iso: string | null) {
    if (!iso) return 'Not set';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <div className="projects-page space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: activeOrg?.name || 'Organisation', href: '/app' },
          { label: 'Projects & Tasks' },
        ]}
      />

      {/* Header */}
      <div className="project-heading flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Projects & Tasks
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage project members, assign tasks and track deadlines.
          </p>
        </div>
        {canCreateProject && (
          <Button
            variant="primary"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 self-start sm:self-auto shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </Button>
        )}
      </div>

      {accessDenied ? (
        <Card className="border-red-200 bg-red-50/20 p-8 text-center max-w-xl mx-auto my-8">
          <CardContent className="space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">Access Restricted</h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto">{accessDenied}</p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link className="workspace-text-link" to="/app">Return to workspace</Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {errorMsg && (
            <Alert variant="error" className="text-sm">
              {errorMsg} <button type="button" className="workspace-text-link" onClick={fetchProjects}>Try again</button>
            </Alert>
          )}

          {/* Filters Bar */}
      <div className="py-1">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                aria-label="Search projects"
                placeholder="Search projects"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm w-full"
              />
            </div>

            {/* Priority Selector */}
            <div className="w-full md:w-48">
              <select
                aria-label="Filter by priority"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="all">All Priorities</option>
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent Priority</option>
              </select>
            </div>
          </div>

          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
            <span className="text-xs font-medium text-slate-500 mr-1.5">Status:</span>
            {[
              { id: 'all', label: 'All' },
              { id: 'planning', label: 'Planning' },
              { id: 'active', label: 'Active' },
              { id: 'on_hold', label: 'On Hold' },
              { id: 'completed', label: 'Completed' },
              { id: 'archived', label: 'Archived' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={statusFilter === tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-brand-50 text-brand-700 border border-brand-200 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="py-16 text-center">
          <div className="inline-block animate-spin w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full mb-3" />
          <p className="text-sm text-slate-500">Loading projects...</p>
        </div>
      ) : errorMsg ? null : projects.length === 0 ? (
        <Card className="border border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <FolderKanban className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-base text-slate-800">
                {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
                  ? 'No matching projects found'
                  : 'No projects to show'}
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
                  ? 'Try adjusting your search keywords, priority, or status filters.'
                  : 'Projects you can access will appear here.'}
              </CardDescription>
            </div>
            {canCreateProject && !searchQuery && statusFilter === 'all' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateOpen(true)}
                className="mt-2"
              >
                <Plus className="w-4 h-4 mr-1" /> Create First Project
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="project-directory" aria-label="Projects">
          {projects.map(project => (
            <li key={project.id}>
              <Link to={`/app/organisations/${effectiveOrgId}/projects/${project.id}`}>
                <div className="min-w-0">
                  <div className="project-status-row mb-2">
                    <Badge variant={PROJECT_STATUS_VARIANTS[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
                    <Badge variant={PROJECT_PRIORITY_VARIANTS[project.priority]}>{PROJECT_PRIORITY_LABELS[project.priority]} priority</Badge>
                  </div>
                  <h2>{project.name}</h2>
                  {project.description && <p className="line-clamp-2">{project.description}</p>}
                  {project.labels?.length > 0 && <p className="text-sm">{project.labels.join(' · ')}</p>}
                </div>
                <dl>
                  <div><dt>Owner</dt><dd>{project.ownerName || 'Unassigned'}</dd></div>
                  <div><dt>Target date</dt><dd>{formatDate(project.targetDate)}</dd></div>
                  {project.memberCount != null && <div><dt>Members</dt><dd>{project.memberCount}</dd></div>}
                </dl>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Create Dialog */}
      {effectiveOrgId && (
        <CreateProjectDialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          organisationId={effectiveOrgId}
          onSuccess={(newProject) => {
            setProjects((prev) => [newProject, ...prev]);
          }}
        />
      )}
        </>
      )}
    </div>
  );
}
