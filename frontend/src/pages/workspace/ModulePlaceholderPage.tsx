import { Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Construction } from 'lucide-react';

export interface ModulePlaceholderProps {
  moduleName: string;
  moduleKey?: string;
  scheduledPhase: string;
  prerequisites: string;
  description: string;
  backHref?: string;
}

export function ModulePlaceholderPage({
  moduleName,
  moduleKey,
  scheduledPhase,
  prerequisites,
  description,
  backHref = '/app',
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: moduleName },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{moduleName}</h1>
            <Badge variant="brand">{scheduledPhase}</Badge>
          </div>
          {moduleKey && (
            <p className="text-xs text-slate-500 mt-1">
              Internal Key: <code className="bg-slate-100 px-1 py-0.5 rounded">{moduleKey}</code>
            </p>
          )}
        </div>
        <Link to={backHref}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </Button>
        </Link>
      </div>

      <Card className="border-dashed border-slate-300">
        <CardHeader className="text-center py-10 space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
            <Construction className="h-6 w-6 text-slate-600" />
          </div>
          <CardTitle className="text-lg">Module Scheduled for {scheduledPhase}</CardTitle>
          <CardDescription className="max-w-md mx-auto leading-relaxed">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t border-border bg-slate-50 p-6 rounded-b-lg text-xs space-y-2 text-slate-600">
          <div>
            <strong className="text-slate-800">Prerequisites:</strong> {prerequisites}
          </div>
          <div>
            <strong className="text-slate-800">Scope Restriction:</strong> In accordance with the prompt pack and PRD rules, this placeholder contains zero mock CRUD data. Full functional schemas, APIs, and views will be implemented in vertical slices during {scheduledPhase}.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
