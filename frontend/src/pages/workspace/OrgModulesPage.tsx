import React, { useEffect, useState, useCallback, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { Alert } from '@/components/ui/Alert';
import { Calendar, Video, CheckSquare, Layers, ShieldAlert, ArrowRight } from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { workspaceTools, WorkspaceToolsContext } from './workspaceTools';
import { useOrg } from '@/api/OrgContext';

export interface ModuleItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  isPlatformAvailable: boolean;
  isEnabled: boolean;
  enabledAt: string | null;
}

const MODULE_ICONS: Record<string, React.ElementType> = {
  events: Calendar,
  meetings: Video,
  projects: CheckSquare,
};

export function OrgModulesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const catalogue = useContext(WorkspaceToolsContext);
  const { activeOrg, activeDetails } = useOrg();

  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;
  const canManageModules =
    activeDetails?.membership?.permissions?.includes('org.modules.manage') ||
    activeDetails?.membership?.role?.slug === 'organisation_owner' ||
    activeDetails?.membership?.role?.slug === 'organisation_admin';

  const fetchModules = useCallback(async () => {
    if (!effectiveOrgId) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await apiClient<{ modules: ModuleItem[] }>(
        `/organisations/${effectiveOrgId}/modules`
      );
      if (res.data) {
        setModules(res.data.modules || []);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to load organisation modules.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOrgId]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  async function handleToggleModule(moduleSlug: string, newEnabledState: boolean) {
    if (!effectiveOrgId || !canManageModules) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsUpdating(moduleSlug);

    try {
      const res = await apiClient<{ module: ModuleItem }>(
        `/organisations/${effectiveOrgId}/modules/${moduleSlug}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isEnabled: newEnabledState }),
        }
      );

      if (res.data?.module) {
        setModules((prev) =>
          prev.map((m) => (m.slug === moduleSlug ? res.data!.module : m))
        );
        catalogue.refresh?.();
        setSuccessMsg(
          `Module "${res.data.module.name}" is now ${newEnabledState ? 'enabled' : 'disabled'} for ${activeOrg?.name || 'this organisation'}.`
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('The tool setting could not be saved.');
      }
    } finally {
      setIsUpdating(null);
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: activeOrg?.name || 'Organisation', href: '/app' },
          { label: 'Workspace tools' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Workspace tools</h1>
          <p className="text-xs text-slate-500 mt-1">
            Choose the tools available to <strong className="text-slate-700">{activeOrg?.name || 'your workspace'}</strong>.
          </p>
        </div>
      </div>

      <p className="text-sm text-slate-600">Turning a tool off pauses access. Your team’s work is saved when you turn it back on.</p>

      {errorMsg && (
        <Alert variant="error" title="Action Failed">
          {errorMsg}
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success" title="Settings Saved">
          {successMsg}
        </Alert>
      )}

      {/* Modules List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-xs text-slate-400">
              Loading workspace tools…
            </CardContent>
          </Card>
        ) : modules.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-xs text-slate-400">
              No tools are available for this organisation.
            </CardContent>
          </Card>
        ) : (
          modules.map((mod) => {
            const Icon = MODULE_ICONS[mod.slug] || Layers;
            const isPlatformDown = !mod.isPlatformAvailable;
            const isBusy = isUpdating === mod.slug;

            return (
              <Card key={mod.slug} className={!mod.isEnabled ? 'bg-slate-50/60' : 'bg-white'}>
                <CardHeader className="p-5 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`h-10 w-10 rounded-lg border flex items-center justify-center shrink-0 ${
                          mod.isEnabled && !isPlatformDown
                            ? 'bg-brand-50 border-brand-200 text-brand-700'
                            : 'bg-slate-100 border-slate-200 text-slate-400'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <CardTitle className="text-base text-slate-900">{mod.name}</CardTitle>
                          {isPlatformDown ? (
                            <Badge variant="danger">Unavailable</Badge>
                          ) : mod.isEnabled ? (
                            <Badge variant="success">On</Badge>
                          ) : (
                            <Badge variant="neutral">Disabled</Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                          {workspaceTools.find(tool => tool.slug === mod.slug)?.description || mod.description}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 sm:self-center">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-600">
                          {isPlatformDown
                            ? 'Suspended'
                            : mod.isEnabled
                            ? 'Enabled'
                            : 'Disabled'}
                        </span>
                        <Switch
                          label={mod.name}
                          checked={mod.isEnabled && !isPlatformDown}
                          onCheckedChange={(checked) => handleToggleModule(mod.slug, checked)}
                          disabled={!canManageModules || isPlatformDown || isBusy}
                          id={`switch-${mod.slug}`}
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
                  <div className="flex items-center gap-2">
                    {mod.enabledAt && (
                      <span className="text-slate-400">
                        • Activated {new Date(mod.enabledAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {mod.isEnabled && !isPlatformDown ? (
                    <Link
                      to={`/app/organisations/${effectiveOrgId}/${mod.slug}`}
                      className="text-brand-600 font-medium hover:text-brand-700 inline-flex items-center gap-1 self-start sm:self-auto"
                    >
                      <span>Open {mod.name}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <span className="text-slate-400 italic">
                      {isPlatformDown
                        ? 'Disabled by platform administration'
                        : canManageModules
                        ? 'Toggle switch above to activate'
                        : 'Contact an organisation admin to activate'}
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {!canManageModules && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs text-amber-800">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
          <span>Ask an organisation administrator to change which tools are available.</span>
        </div>
      )}
    </div>
  );
}
