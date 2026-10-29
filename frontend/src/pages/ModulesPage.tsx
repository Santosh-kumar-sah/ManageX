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
                  <CardTitle className="text-lg">Events & Hackathons Management</CardTitle>
                  <p className="text-xs text-slate-500">End-to-end competition, registration, and blind evaluation workflows</p>
                </div>
              </div>
              <Badge variant="brand">Included in Workspace</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600 border-t border-border pt-4">
            <p>
              Provides end-to-end orchestration for conferences, campus competitions, and community hackathons.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Registration & Capacity:</strong>
                Supports verified external participants and guests with automated capacity tracking to guarantee smooth onboarding.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Teams & Project Submissions:</strong>
                Flexible team creation with member limits and direct project links (GitHub repositories, live demo URLs, and presentation slides).
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Independent Judging:</strong>
                Assign designated evaluators to specific submissions. Private scoring rubrics and judge comments remain confidential until results are published.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Automated Leaderboards:</strong>
                Transparent result aggregation with verified tie-handling and instant publication controls for event organizers.
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
                  <CardTitle className="text-lg">Meetings & Minutes Management</CardTitle>
                  <p className="text-xs text-slate-500">Structured agendas, confidential minutes, and tracked action items</p>
                </div>
              </div>
              <Badge variant="brand">Included in Workspace</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600 border-t border-border pt-4">
            <p>
              Professional meeting coordination with timezone intelligence, RSVP attendee tracking, and role-based notes privacy.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Scheduling & Timezones:</strong>
                Automated timezone conversion across attendees, ensuring seamless collaboration for distributed and hybrid teams.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Ordered Agenda Items:</strong>
                Structured, reorderable agenda topics with time allocations to keep every discussion efficient and on schedule.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Confidential Minutes:</strong>
                Document meeting minutes with fine-grained confidentiality controls, restricting executive discussions to authorized stakeholders.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Tracked Action Items:</strong>
                Assign deliverables directly to team members with priorities, due dates, and real-time status updates.
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
                  <CardTitle className="text-lg">Projects & Agile Tasks</CardTitle>
                  <p className="text-xs text-slate-500">High-velocity delivery with interactive Kanban boards and task lists</p>
                </div>
              </div>
              <Badge variant="brand">Included in Workspace</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600 border-t border-border pt-4">
            <p>
              Agile project workspaces with team rosters, priority tracking, and synchronized List and Kanban task boards.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Project Workspaces:</strong>
                Organize projects by team, initiative, or client with dedicated contributor access controls.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Task Workflows:</strong>
                Streamlined task states from Backlog through In Progress, Review, and Completed with urgency tags.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Dual Kanban & List Views:</strong>
                Seamlessly toggle between visual drag-and-drop Kanban boards and structured table views.
              </div>
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                <strong className="block font-semibold text-slate-800 mb-1">Delivery Accountability:</strong>
                Clear task ownership, due date reminders, and activity history to keep projects on track.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
