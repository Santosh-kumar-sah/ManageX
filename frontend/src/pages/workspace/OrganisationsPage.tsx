import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Building2, Plus, ArrowRight } from 'lucide-react';

export function OrganisationsPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: 'Organisations' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Your Organisations</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your tenant workspaces, switch between organisations, or create a new organisation.
          </p>
        </div>
        <Button size="sm" className="gap-1.5 self-start" disabled>
          <Plus className="h-4 w-4" />
          <span>New Organisation (Phase 4)</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Active Demo Org Card */}
        <Card className="border-brand-200">
          <CardHeader className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="h-9 w-9 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-700 font-bold">
                A
              </div>
              <Badge variant="brand">Active Workspace</Badge>
            </div>
            <CardTitle className="text-base">Acme Enterprise</CardTitle>
            <CardDescription className="text-xs">
              Slug: <code className="bg-slate-100 px-1 py-0.5 rounded">acme-enterprise</code> • Role: Owner
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 border-t border-border mt-3 flex justify-between items-center text-xs text-slate-500">
            <span>Current active context</span>
            <span className="font-semibold text-brand-600 flex items-center gap-1">
              Active <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </CardContent>
        </Card>

        {/* Phase 4 Information Card */}
        <Card className="border-dashed border-slate-300 bg-slate-50/50 flex flex-col justify-center items-center p-8 text-center">
          <Building2 className="h-8 w-8 text-slate-400 mb-2 stroke-1" />
          <h3 className="text-sm font-semibold text-slate-800">Multi-Organisation Management</h3>
          <p className="text-xs text-slate-500 max-w-xs mt-1">
            Organisation creation, invitations, membership lifecycle, and owner invariants will be functional in Phase 4.
          </p>
        </Card>
      </div>
    </div>
  );
}
