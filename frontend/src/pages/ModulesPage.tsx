import { Calendar, Video, CheckSquare } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';

export function ModulesPage() {
  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Product Modules' },
        ]}
      />

      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Product Modules</h1>
        <p className="text-sm text-slate-500 max-w-2xl">
          ManageX is designed around three foundational domain modules that can be activated or deactivated independently by each organisation.
        </p>
      </div>

      <div className="space-y-8">
        {/* Module 1: Events & Hackathons */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-brand-600">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">1. Events & Hackathons Management</CardTitle>
                  <p className="text-xs text-slate-500">Module Key: <code className="bg-slate-100 px-1 py-0.5 rounded">events</code> • Phase 6</p>
                </div>
              </div>
              <Badge variant="brand">Core MVP Module</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600 border-t border-border pt-4">
            <p>
              Provides end-to-end lifecycle orchestration for corporate events, workshops, and hackathons.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Registration & Capacity:</strong>
                Supports verified external participants without granting general organisation membership. Enforces strict transactional concurrency locks on capacity.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Teams & URL Submissions:</strong>
                Hackathon team creation (1 to 100 members) and URL-only project submissions. Zero file-upload risks in MVP.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Assigned Judging:</strong>
                Judges can evaluate only explicitly assigned submissions. Unpublished scores and criteria comments remain strictly private.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Straight-Sum Results:</strong>
                Transparent result calculation with shared ranks for tied totals; controlled audit-logged publication by authorized managers.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Module 2: Meetings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-brand-600">
                  <Video className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">2. Meetings Management</CardTitle>
                  <p className="text-xs text-slate-500">Module Key: <code className="bg-slate-100 px-1 py-0.5 rounded">meetings</code> • Phase 7</p>
                </div>
              </div>
              <Badge variant="brand">Core MVP Module</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600 border-t border-border pt-4">
            <p>
              Structured meeting governance with timezone support, attendee management, and confidential note scoping.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Scheduling & Timezones:</strong>
                Maintains UTC instants and IANA timezone identifiers. Canonical lifecycle: Scheduled, In Progress, Completed, Cancelled.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Ordered Agenda Items:</strong>
                Sequenced agenda topics with optional time allocations, editable and reorderable by authorized organisers.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Confidential Minutes:</strong>
                Meeting minutes are restricted to organisers and explicit permission holders by default. Attendees cannot read minutes automatically.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Action Items:</strong>
                Trackable deliverables assigned to eligible organisation members with priority, due date, and status guards.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Module 3: Projects & Tasks */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-brand-600">
                  <CheckSquare className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">3. Projects & Tasks Management</CardTitle>
                  <p className="text-xs text-slate-500">Module Key: <code className="bg-slate-100 px-1 py-0.5 rounded">projects</code> • Phase 8</p>
                </div>
              </div>
              <Badge variant="brand">Core MVP Module</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600 border-t border-border pt-4">
            <p>
              Project workspaces with membership scoping, task status lifecycles, and synchronized List & Kanban views.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Project Membership:</strong>
                Resource-scoped access. Organisation membership alone does not grant access to all projects.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Task Status Lifecycle:</strong>
                Canonical statuses: Backlog, To Do, In Progress, Blocked, Done. Server-validated status state machine.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">List & Kanban Views:</strong>
                Dual synchronized views with server-confirmed status changes, keyboard accessibility, and optimistic reconciliation.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Assignment Protection:</strong>
                Removing a project member with active tasks is blocked until tasks are reassigned. Soft delete preserves history.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
