import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  EyeOff,
  FileCheck,
  GraduationCap,
  Building2,
  Rocket,
  CheckCircle2,
  ArrowRight,
  Layers,
  KeyRound,
  Server,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export function SecurityPage() {
  const safeguards = [
    {
      audience: 'Colleges & Universities',
      icon: GraduationCap,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
      description: 'Run campus hackathons and departmental operations with clear boundaries between faculty, staff, and students.',
      points: [
        'External student participants are firewalled from faculty records and staff directories',
        'Confidential minutes for academic committees and departmental syncs',
        'Blind judge scoring to ensure unbiased academic and hackathon evaluations',
      ],
    },
    {
      audience: 'Communities & Student Chapters',
      icon: Rocket,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
      description: 'Host public hackathons, code jams, and tech meetups while keeping core organizer discussions private.',
      points: [
        'Public registration links that allow external team formation without club access',
        'Dedicated roles for organizers, volunteer coordinators, and guest judges',
        'Tamper-proof audit logs for all score submissions and leaderboard rankings',
      ],
    },
    {
      audience: 'Startups & Growing Teams',
      icon: Building2,
      color: 'text-brand-600 bg-brand-50 border-brand-100',
      description: 'Manage sprint meetings, client project delivery, and demo days with enterprise-grade data protection out of the box.',
      points: [
        'Strict database-level isolation ensuring zero cross-organization data leakage',
        'Confidential project boards and restricted meeting agendas for leadership syncs',
        'Role-based permissions without requiring a dedicated IT security department',
      ],
    },
  ];

  const securityPillars = [
    {
      title: 'Strict Workspace Isolation',
      icon: Server,
      description: 'Every organization operates within an isolated tenant boundary at the database level. Data from one organization can never be queried or viewed by another.',
    },
    {
      title: 'Participant Boundary Firewall',
      icon: EyeOff,
      description: 'Students and external participants registering for events get participant-only access. They cannot view internal members, private meetings, or other modules.',
    },
    {
      title: 'Confidential Minutes & Blind Scoring',
      icon: Lock,
      description: 'Sensitive meeting minutes can be restricted to designated attendees. Hackathon scores remain private to assigned judges until officially announced.',
    },
    {
      title: 'Multi-Layer Role Governance',
      icon: ShieldCheck,
      description: 'Platform, Organization, and Module permissions operate on independent scopes. Organization roles never grant unintended platform or cross-module access.',
    },
    {
      title: 'Tamper-Resistant Audit Logging',
      icon: FileCheck,
      description: 'All sensitive administrative actions, score submissions, and status changes are permanently logged with verified timestamps and actor identities.',
    },
    {
      title: 'Zero-Trust Least Privilege',
      icon: KeyRound,
      description: 'Runtime application services operate under strictly constrained privileges with zero superuser backdoors, enforcing defense-in-depth across all requests.',
    },
  ];

  const pipelineSteps = [
    {
      step: '1',
      title: 'Identity Verification',
      desc: 'Cryptographically verified session authentication with automated expiry.',
    },
    {
      step: '2',
      title: 'Workspace Membership',
      desc: 'Validates active membership status within the specific organization.',
    },
    {
      step: '3',
      title: 'Module Entitlement',
      desc: 'Confirms the requested module is active and enabled for the organization.',
    },
    {
      step: '4',
      title: 'Scoped Role Permissions',
      desc: 'Verifies the user has explicit permission for the specific requested action.',
    },
    {
      step: '5',
      title: 'Engine-Level Isolation',
      desc: 'Database Row-Level Security automatically confines results to the active tenant.',
    },
  ];

  return (
    <div className="py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-16">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Security & Privacy' },
        ]}
      />

      {/* Header Section */}
      <section className="space-y-4 max-w-3xl">
        <Badge variant="brand" className="px-3 py-1 text-xs font-semibold">
          Security, Privacy & Data Protection
        </Badge>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Enterprise-grade trust, built for teams of all sizes
        </h1>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
          Whether you are a university hosting an inter-college hackathon, a student club running community meetups, or a startup coordinating client deliverables, ManageX guarantees your data remains private, isolated, and strictly protected.
        </p>
      </section>

      {/* Audience-Specific Safeguards */}
      <section className="space-y-6">
        <div className="space-y-1">
          <Badge variant="neutral" className="px-3 py-0.5 text-xs">
            Tailored Protections
          </Badge>
          <h2 className="text-2xl font-bold text-slate-900">
            Engineered for Colleges, Communities & Companies
          </h2>
          <p className="text-sm text-slate-500">
            How our security model addresses the unique operational requirements of different organizations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {safeguards.map((item) => (
            <Card key={item.audience} className="border-border bg-white shadow-card flex flex-col justify-between">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`h-10 w-10 rounded-lg border flex items-center justify-center shrink-0 ${item.color}`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg font-bold text-slate-900">{item.audience}</CardTitle>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  {item.description}
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="border-t border-border pt-4 space-y-2.5">
                  {item.points.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Core Security Pillars */}
      <section className="space-y-6">
        <div className="space-y-1">
          <Badge variant="neutral" className="px-3 py-0.5 text-xs">
            Architectural Guarantees
          </Badge>
          <h2 className="text-2xl font-bold text-slate-900">
            Core Security & Privacy Invariants
          </h2>
          <p className="text-sm text-slate-500">
            Six foundational layers safeguarding every workspace on the ManageX platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {securityPillars.map((pillar) => (
            <Card key={pillar.title} className="hover:border-slate-300 transition-all border-border bg-white shadow-subtle">
              <CardHeader>
                <div className="h-9 w-9 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 mb-2">
                  <pillar.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base font-bold text-slate-900">{pillar.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-600 leading-relaxed pt-0">
                {pillar.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Defense-in-Depth Request Pipeline */}
      <section className="rounded-2xl border border-border bg-white p-8 sm:p-10 space-y-8 shadow-card">
        <div className="space-y-2 max-w-2xl">
          <Badge variant="brand" className="px-3 py-0.5 text-xs">
            Zero-Trust Architecture
          </Badge>
          <h2 className="text-2xl font-bold text-slate-900">
            Five-Layer Request Verification Pipeline
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Every incoming request to a workspace resource is evaluated across five consecutive verification gates before any record is read or written.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {pipelineSteps.map((st) => (
            <div key={st.step} className="p-4 rounded-xl bg-surface-subtle border border-border/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
                  Gate {st.step}
                </span>
                <Layers className="h-4 w-4 text-slate-400" />
              </div>
              <h3 className="text-xs font-bold text-slate-900 pt-1">{st.title}</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">{st.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Data Ownership & FAQ */}
      <section className="rounded-2xl bg-surface-subtle border border-border p-8 space-y-6">
        <h2 className="text-xl font-bold text-slate-900">
          Data Ownership & Privacy FAQs
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm text-slate-600">
          <div className="space-y-1.5">
            <h3 className="font-semibold text-slate-900">Who owns our organization’s data?</h3>
            <p className="leading-relaxed text-slate-600 text-xs">
              Your organization maintains 100% legal ownership of all hackathon submissions, meeting minutes, and project files. ManageX does not sell, analyze, or train models on customer workspace data.
            </p>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-slate-900">Can participants from other events view our student projects?</h3>
            <p className="leading-relaxed text-slate-600 text-xs">
              No. Event submissions are restricted to the submitting team and the specific evaluators assigned by the event organizers. No other college or team can access them.
            </p>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-slate-900">Is data encrypted in transit?</h3>
            <p className="leading-relaxed text-slate-600 text-xs">
              Yes. All browser interactions and API communications are encrypted in transit with industry-standard TLS 1.3 encryption.
            </p>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-slate-900">Are audit logs tamper-proof?</h3>
            <p className="leading-relaxed text-slate-600 text-xs">
              Yes. All security, membership, and administrative logs are append-only. Organization members or judges cannot alter or erase logged actions.
            </p>
          </div>
        </div>
      </section>

      {/* Conversion Banner */}
      <section className="rounded-2xl bg-slate-900 text-white p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold">Build your organization workspace with confidence</h2>
        <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
          Set up an isolated workspace for your college, community, or company in seconds.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link to="/auth/register">
            <Button size="lg" className="bg-brand-600 hover:bg-brand-700 text-white gap-2">
              <span>Create Free Workspace</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/modules">
            <Button variant="outline" size="lg" className="border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white">
              Explore Modules
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
