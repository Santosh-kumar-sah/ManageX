import { ShieldCheck, Lock, Database, EyeOff, Server, FileCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';

export function SecurityPage() {
  const securityPillars = [
    {
      title: 'PostgreSQL Row-Level Security (RLS)',
      icon: Database,
      description: 'All tenant-owned tables enforce FORCE ROW LEVEL SECURITY. Policies evaluate transaction-local settings set by the backend on each transaction.',
    },
    {
      title: 'Least-Privilege Database Role',
      icon: Lock,
      description: 'The runtime application database role (managex_app) has DML privileges only, does not own tables, and strictly lacks superuser or BYPASSRLS permissions.',
    },
    {
      title: 'Three-Level Authorization Scopes',
      icon: ShieldCheck,
      description: 'Platform, Organisation, and Module permissions are independent scopes. Having an Organisation Admin role gives zero platform or unauthorized resource access.',
    },
    {
      title: 'Transaction-Local Context Lifecycle',
      icon: Server,
      description: 'Tenant context is set via SET LOCAL on pooled database connections. Context is automatically purged on transaction commit or rollback, preventing cross-tenant leakage.',
    },
    {
      title: 'External Participant Boundary',
      icon: EyeOff,
      description: 'Registering for a public hackathon or event grants no organisation membership. External participants cannot view members, other modules, or private records.',
    },
    {
      title: 'Immutable Append-Only Audit Logging',
      icon: FileCheck,
      description: 'Sensitive administrative, membership, and security actions are recorded in an append-only log. Passwords, session tokens, and confidential notes are strictly excluded.',
    },
  ];

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Security & Tenancy Architecture' },
        ]}
      />

      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Security & Multi-Tenant Architecture
        </h1>
        <p className="text-sm text-slate-500 max-w-2xl">
          Factual technical specifications of how ManageX guarantees database isolation, tenant boundary enforcement, and defense-in-depth access controls.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {securityPillars.map((pillar) => (
          <Card key={pillar.title}>
            <CardHeader>
              <div className="h-9 w-9 rounded-md bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 mb-2">
                <pillar.icon className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">{pillar.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-slate-600 leading-relaxed pt-0">
              {pillar.description}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-white p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-900">Six-Tier Evaluation Pipeline</h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          Every protected API request to an organisation-owned resource passes through six sequential security checks:
        </p>
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-600 font-medium">
          <li><strong>Identity Verification:</strong> Server-side session verification with 30-minute idle and 7-day absolute lifetime.</li>
          <li><strong>Organisation Membership:</strong> Asserts that the authenticated user has an active membership in the target organisation.</li>
          <li><strong>Module Entitlement:</strong> Verifies that the requested module is platform-available and enabled for the organisation.</li>
          <li><strong>Scoped Action Permission:</strong> Checks that the user’s role assignment includes the specific permission key.</li>
          <li><strong>Resource Scope & Ownership:</strong> Validates assignment to the specific resource (e.g. assigned judge for submission).</li>
          <li><strong>PostgreSQL RLS Execution:</strong> Transaction-local SQL policy filters rows at the database engine level.</li>
        </ol>
      </div>
    </div>
  );
}
