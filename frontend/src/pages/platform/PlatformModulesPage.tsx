import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog } from '@/components/ui/Dialog';
import { Boxes, ShieldAlert, CheckCircle2, AlertTriangle, Building, Calendar, Users, Briefcase } from 'lucide-react';
import { apiClient } from '@/api/client';
import { PlatformModule } from '@/types/platform';

export function PlatformModulesPage() {
  const [modules, setModules] = useState<PlatformModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Toggle Modal State
  const [selectedModule, setSelectedModule] = useState<PlatformModule | null>(null);
  const [targetAvailability, setTargetAvailability] = useState<boolean>(true);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    fetchModules();
  }, []);

  const fetchModules = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient<{ modules: PlatformModule[] }>('/platform/modules');
      if (res.data) {
        setModules(res.data.modules);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load platform module catalogue.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenToggle = (mod: PlatformModule, available: boolean) => {
    setSelectedModule(mod);
    setTargetAvailability(available);
    setReason('');
    setModalError(null);
  };

  const handleConfirmToggle = async () => {
    if (!selectedModule) return;

    try {
      setSubmitting(true);
      setModalError(null);

      await apiClient(`/platform/modules/${selectedModule.slug}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_available: targetAvailability,
          reason: reason.trim() || undefined,
        }),
      });

      setSelectedModule(null);
      fetchModules();
    } catch (err: any) {
      setModalError(err?.message || 'Failed to update module platform availability.');
    } finally {
      setSubmitting(false);
    }
  };

  const getModuleIcon = (slug: string) => {
    switch (slug) {
      case 'events':
        return <Calendar className="h-5 w-5 text-indigo-600" />;
      case 'meetings':
        return <Users className="h-5 w-5 text-indigo-600" />;
      case 'projects':
        return <Briefcase className="h-5 w-5 text-indigo-600" />;
      default:
        return <Boxes className="h-5 w-5 text-indigo-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Module Catalogue</h1>
            <Badge variant="brand" className="bg-indigo-950 text-indigo-300 border-indigo-800">
              PLAT-004
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Global availability controls for the 3 fixed MVP modules. Deactivation preserves customer data.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchModules} disabled={loading}>
          Refresh Modules
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Modules List Cards */}
      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="p-8 text-center text-xs text-slate-500">
              Loading module catalogue...
            </CardContent>
          </Card>
        ) : (
          modules.map((mod) => (
            <Card key={mod.slug} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-50 rounded-lg shrink-0">
                      {getModuleIcon(mod.slug)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-slate-900">{mod.name}</h3>
                        <code className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          {mod.slug}
                        </code>
                        {mod.isPlatformAvailable ? (
                          <Badge variant="success">Platform Available</Badge>
                        ) : (
                          <Badge variant="danger">Platform Disabled</Badge>
                        )}
                        {mod.isCore && (
                          <Badge variant="brand" className="text-[10px]">MVP Core</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed max-w-2xl">
                        {mod.description}
                      </p>
                      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5 font-medium text-slate-700">
                          <Building className="h-3.5 w-3.5 text-slate-400" />
                          {mod.activeOrganisationsCount} customer workspaces activated
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex sm:flex-col items-end gap-2">
                    {mod.isPlatformAvailable ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        onClick={() => handleOpenToggle(mod, false)}
                      >
                        Disable Globally
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => handleOpenToggle(mod, true)}
                      >
                        Enable Globally
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Confirmation Dialog (PLAT-007) */}
      <Dialog
        isOpen={selectedModule !== null}
        onClose={() => setSelectedModule(null)}
        title={!targetAvailability ? 'Disable Module Platform-wide' : 'Enable Module Platform-wide'}
        className="sm:max-w-md"
      >
        <div className="space-y-4 py-2 text-xs text-slate-600">
          <div className="flex items-center gap-2 mb-2 font-medium">
            {!targetAvailability ? (
              <span className="flex items-center gap-1.5 text-rose-600">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Disable Module Platform-wide</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Enable Module Platform-wide</span>
              </span>
            )}
          </div>

          {!targetAvailability ? (
            <div className="space-y-2 leading-relaxed">
              <p>
                Disabling <strong>{selectedModule?.name}</strong> platform-wide will{' '}
                <strong>immediately block API access</strong> across all customer organisations with HTTP 403.
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-[11px]">
                <strong>Data Preservation Guarantee:</strong> Disabling platform availability does NOT delete any customer
                records, events, meeting notes, tasks, or comments. When re-enabled, all data is immediately restored.
              </div>
            </div>
          ) : (
            <p className="leading-relaxed">
              Enabling <strong>{selectedModule?.name}</strong> will restore access for all customer organisations that have
              activated this module.
            </p>
          )}

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Operational Reason (Recorded in Platform Audit Log)
            </label>
            <Input
              placeholder="Optional reason for audit log..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              className="text-xs"
            />
          </div>

          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedModule(null)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant={!targetAvailability ? 'destructive' : 'primary'}
            size="sm"
            onClick={handleConfirmToggle}
            disabled={submitting}
          >
            {submitting ? 'Updating...' : !targetAvailability ? 'Disable Module' : 'Enable Module'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
