import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Users, Building, Boxes, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { apiClient } from '@/api/client';
import { PlatformOverview } from '@/types/platform';

export function PlatformOverviewPage() {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient<PlatformOverview>('/platform/overview');
      if (res.data) {
        setData(res.data);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load platform overview.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Operational Overview</h1>
            <Badge variant="brand" className="bg-indigo-950 text-indigo-300 border-indigo-800">
              Operator Console
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time system health, organization directory statistics, and platform module controls.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchOverview} disabled={loading}>
          Refresh Metrics
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Users Card */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="h-4 w-4 text-indigo-600" />
                <span>User Accounts</span>
              </CardTitle>
              <Link to="/platform/accounts" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                Manage &rarr;
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 tracking-tight">
              {loading ? '—' : data?.users.total ?? 0}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {data?.users.active ?? 0} active
              </span>
              <span className="text-slate-300">&bull;</span>
              <span className="text-slate-500">
                {data?.users.suspended ?? 0} suspended
              </span>
              <span className="text-slate-300">&bull;</span>
              <span className="text-slate-500">
                {data?.users.pendingVerification ?? 0} pending
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Organisations Card */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Building className="h-4 w-4 text-indigo-600" />
                <span>Customer Workspaces</span>
              </CardTitle>
              <Link to="/platform/organisations" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                Inspect &rarr;
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 tracking-tight">
              {loading ? '—' : data?.organisations.total ?? 0}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {data?.organisations.active ?? 0} active
              </span>
              <span className="text-slate-300">&bull;</span>
              <span className="text-slate-500">
                {data?.organisations.suspended ?? 0} suspended
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Audit Logs Card */}
        <Card className="hover:shadow-sm transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
                <span>Security & Governance</span>
              </CardTitle>
              <Link to="/platform/audit-logs" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                View Logs &rarr;
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold text-slate-800">
              Append-Only Audit Engine
            </div>
            <div className="mt-2 text-xs text-slate-500 leading-relaxed">
              Platform mutations, account suspensions, and module toggles are logged immutably.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Global Module Catalogue Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Boxes className="h-4 w-4 text-indigo-600" />
              <span>Platform Module Catalogue Status (PLAT-004)</span>
            </CardTitle>
            <Link to="/platform/modules">
              <Button variant="outline" size="sm">
                Manage Availability
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="border-t border-slate-100 pt-4">
          <div className="divide-y divide-slate-100">
            {data?.modules.map((mod) => (
              <div key={mod.slug} className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{mod.name}</span>
                    <code className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                      {mod.slug}
                    </code>
                    {mod.isCore && (
                      <Badge variant="brand" className="text-[10px]">Core</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{mod.description}</p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    {mod.activeOrganisationsCount} workspaces
                  </span>
                  {mod.isPlatformAvailable ? (
                    <Badge variant="success">Available Platform-wide</Badge>
                  ) : (
                    <Badge variant="danger">Disabled Platform-wide</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
