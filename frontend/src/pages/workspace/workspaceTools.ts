import { createContext } from 'react';
import { CalendarDays, ListTodo, Video } from 'lucide-react';

export const workspaceTools = [
  { slug: 'events', name: 'Events & Hackathons', description: 'Manage registrations, teams and submissions.', icon: CalendarDays },
  { slug: 'meetings', name: 'Meetings', description: 'Plan an agenda, record decisions and follow up.', icon: Video },
  { slug: 'projects', name: 'Projects & Tasks', description: 'Organise tasks, assign work and track deadlines.', icon: ListTodo },
];

export interface ToolAvailability {
  slug: string;
  isEnabled: boolean;
  isPlatformAvailable: boolean;
}

export interface WorkspaceToolsState {
  orgId: string | undefined;
  tools?: ToolAvailability[];
  error?: string;
  refresh?: () => void;
  canOpenSettings?: boolean;
}

export const WorkspaceToolsContext = createContext<WorkspaceToolsState>({ orgId: undefined });
