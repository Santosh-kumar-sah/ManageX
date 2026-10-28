import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScheduleMeetingDialog } from './ScheduleMeetingDialog';

vi.mock('@/api/client', () => ({
  apiClient: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number;
    code?: string;
    constructor(statusCode: number, message: string, code?: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));

describe('ScheduleMeetingDialog — Conferencing Provider Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders provider selection radio options and manual link input by default', () => {
    const html = renderToStaticMarkup(
      <ScheduleMeetingDialog
        isOpen={true}
        onClose={vi.fn()}
        orgId="org-tech-corp"
        onMeetingScheduled={vi.fn()}
      />
    );

    expect(html).toContain('Conferencing Provider');
    expect(html).toContain('Google Meet (Automatic)');
    expect(html).toContain('Manual Link');
    expect(html).toContain('data-testid="provider-google-meet-option"');
    expect(html).toContain('data-testid="provider-manual-option"');
    expect(html).toContain('Meeting URL');
  });

  it('renders disabled state hint when Google Meet integration is not connected', () => {
    const html = renderToStaticMarkup(
      <ScheduleMeetingDialog
        isOpen={true}
        onClose={vi.fn()}
        orgId="org-tech-corp"
        onMeetingScheduled={vi.fn()}
      />
    );

    // Initial state before fetch resolves is disconnected
    expect(html).toContain('Not connected');
    expect(html).toContain('Requires Google Workspace connection');
  });

  it('does not render when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <ScheduleMeetingDialog
        isOpen={false}
        onClose={vi.fn()}
        orgId="org-tech-corp"
        onMeetingScheduled={vi.fn()}
      />
    );

    expect(html).toBe('');
  });
});
