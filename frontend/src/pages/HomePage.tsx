import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Video,
  CheckSquare,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Users,
  Lock,
  ChevronDown,
  Building2,
  Layers,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const modules = [
    {
      title: 'Events & Hackathons',
      badge: 'Events & Challenges',
      description: 'End-to-end event and challenge management. Enable participant registrations, team formation, project link submissions, and blind scoring with verified leaderboards.',
      icon: Calendar,
      features: [
        'Team formation with custom member limits',
        'Structured submission links (GitHub, live demo, slides)',
        'Independent judge scoring with custom evaluation criteria',
        'Leaderboard rankings and winner announcements',
      ],
      route: '/modules',
    },
    {
      title: 'Meetings & Minutes',
      badge: 'Agendas & Minutes',
      description: 'Structured organizational meetings. Build ordered agendas, manage attendee confirmations across timezones, write confidential minutes, and assign tracked action items.',
      icon: Video,
      features: [
        'Timezone-aware scheduling & notifications',
        'Real-time RSVP and attendee tracking',
        'Confidential minutes with role-based access',
        'Action items with direct owner assignments & due dates',
      ],
      route: '/modules',
    },
    {
      title: 'Projects & Tasks',
      badge: 'Workflows & Delivery',
      description: 'Flexible agile delivery workspaces. Organize member rosters, track project lifecycles, and switch seamlessly between interactive Kanban boards and structured List views.',
      icon: CheckSquare,
      features: [
        'Interactive Drag & Drop Kanban & List views',
        'Priority tagging (Urgent, High, Medium, Low)',
        'Structured task lifecycles with deadlines & priorities',
        'Team assignments with activity tracking',
      ],
      route: '/modules',
    },
  ];

  const steps = [
    {
      step: '01',
      title: 'Create Your Workspace',
      description: 'Register your organization or institution in seconds. Get an isolated workspace with custom settings and dedicated access controls.',
      icon: Building2,
    },
    {
      step: '02',
      title: 'Enable Your Modules',
      description: 'Choose only the modules your teams need today. Whether you run hackathons, corporate meetings, or engineering projects, activate modules on demand.',
      icon: Layers,
    },
    {
      step: '03',
      title: 'Invite Team & Participants',
      description: 'Invite organizers, managers, and members with tailored roles and permissions. Share public registration links for events and hackathons.',
      icon: Users,
    },
    {
      step: '04',
      title: 'Operate with Confidence',
      description: 'Collect submissions, run structured agendas, and deliver projects with enterprise data privacy and complete audit trails.',
      icon: ShieldCheck,
    },
  ];

  const faqs = [
    {
      q: 'Can my organization use only one module (e.g. only Events or only Meetings)?',
      a: 'Yes. ManageX is fully modular. You can enable only Events & Hackathons, only Meetings, or only Projects & Tasks. Your workspace dashboard and navigation automatically adapt to only the modules your organization enables.',
    },
    {
      q: 'How do students and external participants register for hackathons?',
      a: 'Once an event is published, organizers can share its public registration page. Participants sign up, join or create teams within capacity limits, and submit project links (GitHub repos, demo URLs, documentation) directly through the portal.',
    },
    {
      q: 'How does judge evaluation work in hackathons?',
      a: 'Organizers assign specific judges to submissions. Evaluators log in, review the submitted project artifacts, score each team on pre-set weighted criteria, and submit private scores. The platform automatically aggregates rankings for organizers before winners are publicly announced.',
    },
    {
      q: 'Is our organization data separated and secure from other organizations?',
      a: 'Yes, absolutely. ManageX is engineered with enterprise-grade data privacy. Each organization operates in a dedicated, isolated workspace, ensuring your records, meetings, and projects are strictly confidential and never accessible by other organizations.',
    },
    {
      q: 'Can confidential meeting minutes be restricted from general members?',
      a: 'Yes. Meeting organizers can mark minutes as confidential, restricting access strictly to designated attendees and organization administrators while ensuring general organization members cannot access sensitive discussions.',
    },
  ];

  return (
    <div className="space-y-20 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-4xl mx-auto pt-6">
        <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15]">
          One unified platform. One account. <br />
          <span className="text-brand-600">Total operational clarity.</span>
        </h1>
        <p className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
          ManageX delivers unified management for Hackathons & Events, Structured Meetings, and Agile Projects—with dedicated workspace privacy and role-based security.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link to="/auth/register">
            <Button size="lg" className="gap-2 px-6">
              <span>Get Started Free</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/auth/login">
            <Button variant="outline" size="lg" className="px-6">
              Sign In to Workspace
            </Button>
          </Link>
        </div>
      </section>

      {/* Core Modules Grid */}
      <section id="modules" className="space-y-8 scroll-mt-20">
        <div className="text-center space-y-3">
          <Badge variant="neutral" className="px-3 py-0.5 text-xs">
            Modular Workspace
          </Badge>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
            Switch on only what your team needs
          </h2>
          <p className="text-base text-slate-500 max-w-2xl mx-auto">
            Each module is fully integrated yet independently enabled, ensuring a clutter-free experience tailored to your exact operational requirements.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {modules.map((mod) => (
            <Card key={mod.title} className="hover:border-slate-300 transition-all flex flex-col justify-between border-border bg-white shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <div className="h-11 w-11 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
                    <mod.icon className="h-6 w-6" />
                  </div>
                  <Badge variant="brand" className="text-[11px] font-semibold">{mod.badge}</Badge>
                </div>
                <CardTitle className="text-xl font-bold text-slate-900">{mod.title}</CardTitle>
                <CardDescription className="pt-2 text-sm leading-relaxed text-slate-600">
                  {mod.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Key Highlights</p>
                  <ul className="space-y-2">
                    {mod.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                        <CheckCircle2 className="h-3.5 w-3.5 text-brand-600 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2">
                  <Link
                    to={mod.route}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 group"
                  >
                    <span>View module details</span>
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="rounded-2xl border border-border bg-white p-8 sm:p-12 space-y-10 shadow-subtle">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <Badge variant="brand" className="px-3 py-0.5 text-xs">
            Simple 4-Step Onboarding
          </Badge>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
            How ManageX Works
          </h2>
          <p className="text-sm text-slate-500">
            From setup to live execution, launch your organization workspace in minutes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((st) => (
            <div key={st.step} className="p-5 rounded-xl bg-surface-subtle border border-border/80 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-brand-600 bg-brand-50 px-2 py-1 rounded">
                    {st.step}
                  </span>
                  <st.icon className="h-5 w-5 text-slate-500" />
                </div>
                <h3 className="text-base font-bold text-slate-900">{st.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{st.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust & Enterprise Security Pillars */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <Badge variant="neutral" className="px-3 py-0.5 text-xs">
            Enterprise Reliability
          </Badge>
          <h2 className="text-2xl font-bold text-slate-900">
            Security & Governance You Can Rely On
          </h2>
          <p className="text-sm text-slate-500 max-w-xl mx-auto">
            Built with dedicated workspace privacy, granular role permissions, and full audit transparency.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl border border-border bg-white shadow-subtle space-y-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Lock className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Dedicated Workspace Privacy</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every organization operates within its own secure workspace. Enterprise-grade isolation ensures your team data remains strictly confidential and protected.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-white shadow-subtle space-y-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Users className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Granular Role Governance</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Define clear roles for organization leaders, project contributors, event judges, and meeting attendees to ensure members only access what they need.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-white shadow-subtle space-y-3">
            <div className="h-9 w-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <FileText className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Complete Audit Trails</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every critical action—from permission changes to evaluation scores and status updates—is recorded with timestamps and verified user details.
            </p>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions (FAQ) */}
      <section className="space-y-6 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <Badge variant="neutral" className="px-3 py-0.5 text-xs">
            Got Questions?
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Frequently Asked Questions
          </h2>
          <p className="text-sm text-slate-500">
            Everything you need to know about setting up and running your ManageX workspace.
          </p>
        </div>

        <div className="space-y-3 pt-4">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div
                key={index}
                className="rounded-lg border border-border bg-white overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(index)}
                  className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 font-semibold text-slate-900 hover:bg-surface-subtle transition-colors text-sm"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-brand-600' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-border/60 pt-3 bg-surface-subtle/50">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom Call to Action */}
      <section className="rounded-2xl bg-slate-900 text-white p-8 sm:p-12 text-center space-y-6">
        <div className="max-w-2xl mx-auto space-y-3">
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Ready to streamline your organization's operations?
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Create your organization workspace today. Activate only the modules you need and collaborate with total confidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link to="/auth/register">
            <Button size="lg" className="bg-brand-600 hover:bg-brand-700 text-white gap-2 px-8">
              <span>Create Free Workspace</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/auth/login">
            <Button variant="outline" size="lg" className="border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white">
              Sign In
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
