import { Link } from 'react-router-dom';
import { Calendar, Video, CheckSquare, ShieldCheck, ArrowRight, Layers, Database } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export function HomePage() {
  const modules = [
    {
      title: 'Events & Hackathons',
      description: 'Lifecycle management for general events and hackathons. Features team formation, URL submissions, assigned-only judging, and controlled results publication.',
      icon: Calendar,
      phase: 'Phase 6',
      route: '/modules',
    },
    {
      title: 'Meetings',
      description: 'Timezone-aware scheduling, ordered agenda items, confidential minutes with restricted visibility, and action items with assignment tracking.',
      icon: Video,
      phase: 'Phase 7',
      route: '/modules',
    },
    {
      title: 'Projects & Tasks',
      description: 'Project lifecycles, project-member assignments, List and Kanban task boards, due-date tracking, and safe soft deletion.',
      icon: CheckSquare,
      phase: 'Phase 8',
      route: '/modules',
    },
  ];

  return (
    <div className="space-y-16 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-3xl mx-auto pt-6">
        <Badge variant="brand" className="px-3 py-1 text-xs">
          Multi-Tenant B2B SaaS Platform
        </Badge>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          One Unified Platform for Enterprise Workspaces
        </h1>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
          ManageX provides isolated, secure, and modular management for organisations. Activate only the modules you need: Events & Hackathons, Meetings, and Projects & Tasks.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link to="/app">
            <Button size="lg" className="gap-2">
              <span>Open Workspace Shell</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/security">
            <Button variant="outline" size="lg">
              Explore Security Architecture
            </Button>
          </Link>
        </div>
      </section>

      {/* Modules Grid */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">Core Product Modules</h2>
          <p className="text-sm text-slate-500 max-w-xl mx-auto">
            Modular architecture designed for independent activation and strict tenant isolation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modules.map((mod) => (
            <Card key={mod.title} className="hover:border-slate-300 transition-all flex flex-col justify-between">
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
                    <mod.icon className="h-5 w-5" />
                  </div>
                  <Badge variant="neutral">{mod.phase}</Badge>
                </div>
                <CardTitle>{mod.title}</CardTitle>
                <CardDescription className="pt-2 leading-relaxed">{mod.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Link to={mod.route} className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
                  Learn more <ArrowRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Architectural Pillars Section */}
      <section className="rounded-xl border border-border bg-white p-8 space-y-6">
        <h3 className="text-xl font-bold text-slate-900">Security & Architecture Invariants</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              <span>Three-Level RBAC</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Platform, Organisation, and Module permissions are segregated scopes. Having a role at one level never grants automatic privileges at another.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Database className="h-4 w-4 text-brand-600" />
              <span>PostgreSQL RLS</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Row-Level Security enforced at the database layer with transaction-local context, composite foreign keys, and an unprivileged runtime role.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Layers className="h-4 w-4 text-brand-600" />
              <span>Modular Monolith</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Node.js + Express backend in native ES Modules paired with a strict React + TypeScript frontend and versioned SQL migrations.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
