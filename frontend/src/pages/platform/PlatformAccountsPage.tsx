import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Dialog } from '@/components/ui/Dialog';
import { Users, Search, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { apiClient } from '@/api/client';
import { PlatformAccount } from '@/types/platform';

export function PlatformAccountsPage() {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status Action Modal State
  const [selectedAccount, setSelectedAccount] = useState<PlatformAccount | null>(null);
  const [actionType, setActionType] = useState<'active' | 'suspended' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, [page, statusFilter]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
      });
      if (statusFilter) params.append('status', statusFilter);
      if (search.trim()) params.append('search', search.trim());

      const res = await apiClient<{ accounts: PlatformAccount[]; pagination: { total: number; totalPages: number } }>(
        `/platform/accounts?${params.toString()}`
      );
      if (res.data) {
        setAccounts(res.data.accounts);
        setTotal(res.data.pagination.total);
        setTotalPages(res.data.pagination.totalPages);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch platform accounts.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAccounts();
  };

  const handleOpenActionModal = (account: PlatformAccount, targetStatus: 'active' | 'suspended') => {
    setSelectedAccount(account);
    setActionType(targetStatus);
    setActionReason('');
    setActionError(null);
  };

  const handleConfirmStatusChange = async () => {
    if (!selectedAccount || !actionType) return;

    try {
      setActionSubmitting(true);
      setActionError(null);

      await apiClient(`/platform/accounts/${selectedAccount.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: actionType,
          reason: actionReason.trim() || undefined,
        }),
      });

      setSelectedAccount(null);
      setActionType(null);
      fetchAccounts();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update account status.');
    } finally {
      setActionSubmitting(false);
    }
  };

  const renderStatusBadge = (status: PlatformAccount['status']) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'suspended':
        return <Badge variant="danger">Suspended</Badge>;
      case 'pending_verification':
        return <Badge variant="warning">Pending Verification</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const renderRoleBadge = (account: PlatformAccount) => {
    if (account.platformRole === 'platform_super_admin' || account.isPlatformAdmin) {
      return (
        <Badge variant="brand" className="bg-indigo-950 text-indigo-300 border-indigo-800 text-[10px]">
          Super Admin
        </Badge>
      );
    }
    if (account.platformRole === 'platform_support_agent') {
      return (
        <Badge variant="neutral" className="bg-sky-950 text-sky-300 border-sky-800 text-[10px]">
          Support Agent
        </Badge>
      );
    }
    return <span className="text-xs text-slate-500">Standard User</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform User Accounts</h1>
            <Badge variant="brand" className="bg-indigo-950 text-indigo-300 border-indigo-800">
              PLAT-002
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Global account status inspection and operational suspension controls.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => fetchAccounts()} disabled={loading}>
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
                placeholder="Search accounts by name or email address..."
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
              <option value="">All Account Statuses</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
              <option value="pending_verification">Pending Verification</option>
            </Select>

            <Button type="submit" variant="secondary" size="sm" className="whitespace-nowrap">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Accounts Table */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Users className="h-4 w-4 text-indigo-600" />
            <span>Total Accounts ({total})</span>
          </CardTitle>
          <span className="text-xs text-slate-400">
            Page {page} of {totalPages}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Platform Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-500">
                    Loading account records...
                  </TableCell>
                </TableRow>
              ) : accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-500">
                    No accounts found matching your query.
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-medium text-slate-900 text-xs">
                      {acc.fullName}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 font-mono">
                      {acc.email}
                    </TableCell>
                    <TableCell>{renderRoleBadge(acc)}</TableCell>
                    <TableCell>{renderStatusBadge(acc.status)}</TableCell>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {new Date(acc.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {acc.status === 'active' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => handleOpenActionModal(acc, 'suspended')}
                        >
                          Suspend
                        </Button>
                      ) : acc.status === 'suspended' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handleOpenActionModal(acc, 'active')}
                        >
                          Activate
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
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

      {/* Confirmation Dialog (PLAT-007) */}
      <Dialog
        isOpen={selectedAccount !== null}
        onClose={() => setSelectedAccount(null)}
        title={actionType === 'suspended' ? 'Confirm Account Suspension' : 'Confirm Account Reactivation'}
        className="sm:max-w-md"
      >
        <div className="space-y-4 py-2 text-xs text-slate-600">
          <div className="flex items-center gap-2 mb-2 font-medium">
            {actionType === 'suspended' ? (
              <span className="flex items-center gap-1.5 text-rose-600">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Account Suspension</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Account Reactivation</span>
              </span>
            )}
          </div>

          {actionType === 'suspended' ? (
            <p className="leading-relaxed">
              Suspending <strong>{selectedAccount?.fullName}</strong> ({selectedAccount?.email}) will{' '}
              <strong>immediately revoke all active sessions</strong> and block subsequent logins.
              Historical user data and workspace records are preserved.
            </p>
          ) : (
            <p className="leading-relaxed">
              Reactivating <strong>{selectedAccount?.fullName}</strong> will restore login capabilities and workspace access.
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
            onClick={() => setSelectedAccount(null)}
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
            {actionSubmitting ? 'Updating...' : actionType === 'suspended' ? 'Suspend Account' : 'Reactivate Account'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
