import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Dialog } from '@/components/ui/Dialog';
import { Building, Search, AlertTriangle, ShieldAlert, CheckCircle2, Eye, Boxes } from 'lucide-react';
import { apiClient } from '@/api/client';
import { PlatformOrganisation } from '@/types/platform';

export function PlatformOrganisationsPage() {
  const [organisations, setOrganisations] = useState<PlatformOrganisation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status Action Modal State
  const [selectedOrg, setSelectedOrg] = useState<PlatformOrganisation | null>(null);
  const [actionType, setActionType] = useState<'active' | 'suspended' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Inspection Modal State (PLAT-003, SEC-009)
  const [inspectOrg, setInspectOrg] = useState<PlatformOrganisation | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  useEffect(() => {
    fetchOrganisations();
  }, [page, statusFilter]);

  const fetchOrganisations = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
      });
      if (statusFilter) params.append('status', statusFilter);
      if (search.trim()) params.append('search', search.trim());

      const res = await apiClient<{ organisations: PlatformOrganisation[]; pagination: { total: number; totalPages: number } }>(
        `/platform/organisations?${params.toString()}`
      );
      if (res.data) {
        setOrganisations(res.data.organisations);
        setTotal(res.data.pagination.total);
        setTotalPages(res.data.pagination.totalPages);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch customer organisations.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrganisations();
  };

  const handleOpenActionModal = (org: PlatformOrganisation, targetStatus: 'active' | 'suspended') => {
    setSelectedOrg(org);
    setActionType(targetStatus);
    setActionReason('');
    setActionError(null);
  };

  const handleConfirmStatusChange = async () => {
    if (!selectedOrg || !actionType) return;

    try {
      setActionSubmitting(true);
      setActionError(null);

      await apiClient(`/platform/organisations/${selectedOrg.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: actionType,
          reason: actionReason.trim() || undefined,
        }),
      });

      setSelectedOrg(null);
      setActionType(null);
      fetchOrganisations();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update organisation status.');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleInspect = async (orgId: string) => {
    try {
      setInspectLoading(true);
      const res = await apiClient<PlatformOrganisation>(`/platform/organisations/${orgId}`);
      if (res.data) {
        setInspectOrg(res.data);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load organisation inspection metadata.');
    } finally {
      setInspectLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customer Workspaces</h1>
            <Badge variant="brand" className="bg-indigo-950 text-indigo-300 border-indigo-800">
              PLAT-003
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Operational tenant inspection and suspension controls. Strictly isolated from private tenant records.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => fetchOrganisations()} disabled={loading}>
          Refresh List
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search workspaces by name or slug..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-48 text-xs"
            >
              <option value="">All Statuses</option>
              <option value="active">Active Workspaces</option>
              <option value="suspended">Suspended Workspaces</option>
            </Select>

            <Button type="submit" variant="secondary" size="sm" className="whitespace-nowrap">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Organisations Table */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Building className="h-4 w-4 text-indigo-600" />
            <span>Workspaces ({total})</span>
          </CardTitle>
          <span className="text-xs text-slate-400">
            Page {page} of {totalPages}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Active Members</TableHead>
                <TableHead>Active Modules</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-xs text-slate-500">
                    Loading workspace records...
                  </TableCell>
                </TableRow>
              ) : organisations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-xs text-slate-500">
                    No organisations found.
                  </TableCell>
                </TableRow>
              ) : (
                organisations.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium text-slate-900 text-xs">
                      {org.name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 font-mono">
                      {org.slug}
                    </TableCell>
                    <TableCell>
                      {org.status === 'active' ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="danger">Suspended</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {org.memberCount} members
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {org.activeModulesCount} / 3 modules
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-slate-600 hover:text-slate-900"
                        onClick={() => handleInspect(org.id)}
                        disabled={inspectLoading}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Inspect
                      </Button>

                      {org.status === 'active' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => handleOpenActionModal(org, 'suspended')}
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handleOpenActionModal(org, 'active')}
                        >
                          Activate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100 text-xs text-slate-500">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Operational Inspection Modal (PLAT-003, SEC-009) */}
      <Dialog
        isOpen={inspectOrg !== null}
        onClose={() => setInspectOrg(null)}
        title="Workspace Operational Metadata"
        className="sm:max-w-lg"
      >
        {inspectOrg && (
          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded border border-slate-100">
              <div>
                <span className="text-slate-400 block mb-0.5">Workspace Name</span>
                <strong className="text-slate-800 text-sm">{inspectOrg.name}</strong>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Workspace Slug</span>
                <code className="text-slate-700 font-mono text-xs">{inspectOrg.slug}</code>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Active Members</span>
                <span className="text-slate-800 font-medium">{inspectOrg.memberCount} active members</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Status</span>
                {inspectOrg.status === 'active' ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="danger">Suspended</Badge>
                )}
              </div>
            </div>

            {/* Module Entitlement Inspection */}
            <div>
              <h4 className="font-semibold text-slate-800 flex items-center gap-1.5 mb-2">
                <Boxes className="h-4 w-4 text-indigo-600" />
                <span>Module Entitlements</span>
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded">
                {inspectOrg.modules?.map((m) => (
                  <div key={m.slug} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-medium text-slate-800">{m.name}</span>
                      <code className="text-[10px] text-slate-400 ml-1.5 font-mono">({m.slug})</code>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.isEnabled ? (
                        <Badge variant="success">Activated in Org</Badge>
                      ) : (
                        <Badge variant="neutral">Deactivated</Badge>
                      )}
                      {!m.isPlatformAvailable && (
                        <Badge variant="danger">Disabled Platform-wide</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded text-[11px] text-slate-600">
              <strong>Platform Boundary:</strong> In accordance with PRD SEC-009, platform operators inspect
              operational metadata only. Private tenant records (events, submissions, meeting minutes, project
              tasks, comments) remain strictly protected by database Row-Level Security.
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4 pt-3 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={() => setInspectOrg(null)}>
            Close
          </Button>
        </div>
      </Dialog>

      {/* Confirmation Dialog (PLAT-007) */}
      <Dialog
        isOpen={selectedOrg !== null}
        onClose={() => setSelectedOrg(null)}
        title={actionType === 'suspended' ? 'Suspend Workspace' : 'Reactivate Workspace'}
        className="sm:max-w-md"
      >
        <div className="space-y-4 py-2 text-xs text-slate-600">
          <div className="flex items-center gap-2 mb-2 font-medium">
            {actionType === 'suspended' ? (
              <span className="flex items-center gap-1.5 text-rose-600">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Workspace Suspension</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Workspace Reactivation</span>
              </span>
            )}
          </div>

          {actionType === 'suspended' ? (
            <p className="leading-relaxed">
              Suspending workspace <strong>{selectedOrg?.name}</strong> will{' '}
              <strong>block all member access immediately</strong> with HTTP 403.
              All underlying projects, events, meetings, tasks, and audit history are{' '}
              <strong>safely preserved intact</strong> (non-destructive).
            </p>
          ) : (
            <p className="leading-relaxed">
              Reactivating <strong>{selectedOrg?.name}</strong> will restore access for all active workspace members.
            </p>
          )}

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Operational Reason (Recorded in Platform Audit Log)
            </label>
            <Input
              placeholder="Optional reason for audit log..."
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              maxLength={500}
              className="text-xs"
            />
          </div>

          {actionError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedOrg(null)}
            disabled={actionSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant={actionType === 'suspended' ? 'destructive' : 'primary'}
            size="sm"
            onClick={handleConfirmStatusChange}
            disabled={actionSubmitting}
          >
            {actionSubmitting ? 'Updating...' : actionType === 'suspended' ? 'Suspend Workspace' : 'Reactivate Workspace'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
