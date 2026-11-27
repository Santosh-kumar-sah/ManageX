import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { ShieldCheck, User, RefreshCw } from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';

export interface AuditRecord {
  id: string;
  action: string;
  actor: { name: string | null; email: string | null } | null;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
}

const ACTION_BADGE_VARIANTS: Record<string, 'brand' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  'org.created': 'brand',
  'org.updated': 'neutral',
  'org.ownership_transferred': 'warning',
  'member.invited': 'brand',
  'member.joined': 'success',
  'member.removed': 'danger',
  'member.role_assigned': 'brand',
  'member.role_removed': 'warning',
  'invitation.revoked': 'danger',
  'module.enabled': 'success',
  'module.disabled': 'warning',
};

export function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    'org.created': 'Organisation Created',
    'org.updated': 'Organisation Updated',
    'org.ownership_transferred': 'Ownership Transferred',
    'member.invited': 'Member Invited',
    'member.joined': 'Member Joined',
    'member.removed': 'Member Removed',
    'member.role_assigned': 'Role Assigned',
    'member.role_removed': 'Role Revoked',
    'invitation.revoked': 'Invitation Revoked',
    'module.enabled': 'Module Activated',
    'module.disabled': 'Module Deactivated',
    'event.created': 'Event Created',
    'event.updated': 'Event Updated',
    'event.status_changed': 'Event Status Changed',
    'meeting.created': 'Meeting Created',
    'meeting.updated': 'Meeting Updated',
    'meeting.status_changed': 'Meeting Status Changed',
    'project.created': 'Project Created',
    'project.updated': 'Project Updated',
    'project.status_changed': 'Project Status Changed',
  };
  if (map[action]) return map[action];
  return action
    .split(/[._]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function OrgAuditLogsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { activeOrg, organisations } = useOrg();
  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;
  if (!effectiveOrgId) return null;
  const name = organisations.find(org => org.id === effectiveOrgId)?.name || 'Organisation';
  return <AuditHistory key={effectiveOrgId} orgId={effectiveOrgId} name={name} />;
}

function AuditHistory({ orgId, name }: { orgId: string; name: string }) {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, totalPages: 1, totalRecords: 0 });
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    async function load() {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const response = await apiClient<{ auditLogs: AuditRecord[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
          `/organisations/${orgId}/audit-logs?page=${page}&limit=20`
        );
        if (current && response.data) {
          const { auditLogs, pagination: result } = response.data;
          setLogs(auditLogs);
          setPagination({ ...result, totalRecords: result.total });
        }
      } catch (err) {
        if (!current) return;
        setLogs([]);
        if (err instanceof ApiError && err.statusCode === 403) setDenied(true);
        else setErrorMsg(err instanceof ApiError ? err.message : 'Could not load the audit log.');
      } finally {
        if (current) setIsLoading(false);
      }
    }
    void load();
    return () => { current = false; };
  }, [orgId, page, refresh]);

  const visibleLogs = actionFilter ? logs.filter(log => log.action === actionFilter) : logs;
  const actions = [...new Set(logs.map(log => log.action))].sort();

  if (denied) {
    return <Alert variant="warning" title="Audit log access is restricted">Ask a workspace administrator if you need access to this history.</Alert>;
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: name, href: '/app' },
          { label: 'Security & Audit Log' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Security & Audit Log</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review changes to membership, settings and tools for{' '}
            <strong className="text-slate-700">{name}</strong>.
          </p>
        </div>

        <button
          onClick={() => setRefresh(value => value + 1)}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-sm transition-colors self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {errorMsg && (
        <Alert variant="error" title="Error Loading Audit Records">
          {errorMsg}
        </Alert>
      )}

      {/* Filter and Log Table */}
      <Card>
        <CardHeader className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Audit Trail</CardTitle>
            <CardDescription className="text-xs">
              Filter the actions on this page of history.
            </CardDescription>
          </div>

          <div className="w-full sm:w-64">
            <Select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
              }}
              aria-label="Filter actions on this page"
            >
              <option value="">All actions</option>
              {actions.map(action => <option key={action} value={action}>{formatAuditAction(action)}</option>)}
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Changed by</TableHead>
                <TableHead>Changed item</TableHead>
                <TableHead>Origin / IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-400 text-xs">
                    Loading audit trail...
                  </TableCell>
                </TableRow>
              ) : visibleLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-400 text-xs">
                    No audit records found matching the current filter.
                  </TableCell>
                </TableRow>
              ) : (
                visibleLogs.map((log) => {
                  const badgeVariant = ACTION_BADGE_VARIANTS[log.action] || 'neutral';
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap font-mono">
                        {new Date(log.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badgeVariant}>{formatAuditAction(log.action)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <div className="text-xs">
                            <span className="font-medium text-slate-800">
                              {log.actor?.name || log.actor?.email || 'System'}
                            </span>
                            {log.actor?.email && (
                              <span className="text-slate-400 block text-[11px]">
                                {log.actor?.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {log.entityType ? (
                          <span>
                            {log.entityType}
                            {log.entityId && (
                              <span className="text-slate-400 text-[11px] block">
                                {log.entityId.substring(0, 8)}...
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono">
                        {log.ipAddress || 'Not recorded'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {pagination && pagination.totalPages > 1 && (
            <div className="p-4 border-t border-border">
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalRecords}
                limit={pagination.limit}
                onPageChange={(newPage) => { setActionFilter(''); setPage(newPage); }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-[11px] text-slate-400 justify-end">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        <span>Workspace members can’t edit or delete audit entries.</span>
      </div>
    </div>
  );
}
