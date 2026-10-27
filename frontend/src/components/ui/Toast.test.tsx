import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Toast, ToastContainer } from './Toast';

describe('Toast Component', () => {
  it('renders toast with message, status role, and appropriate styling for success', () => {
    const onClose = vi.fn();
    const html = renderToStaticMarkup(
      <Toast id="toast-1" message="Meeting updated successfully" type="success" onClose={onClose} />
    );

    expect(html).toContain('Meeting updated successfully');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('Close notification');
    expect(html).toContain('id="toast-1"');
  });

  it('renders toast with error variant styling and message', () => {
    const onClose = vi.fn();
    const html = renderToStaticMarkup(
      <Toast message="Failed to complete meeting" type="error" onClose={onClose} />
    );

    expect(html).toContain('Failed to complete meeting');
    expect(html).toContain('role="status"');
  });

  it('renders ToastContainer with children inside notifications container', () => {
    const html = renderToStaticMarkup(
      <ToastContainer>
        <Toast message="Item saved" type="info" onClose={() => {}} />
      </ToastContainer>
    );

    expect(html).toContain('aria-label="Notifications"');
    expect(html).toContain('Item saved');
  });

  it('renders progress bar element', () => {
    const onClose = vi.fn();
    const html = renderToStaticMarkup(
      <Toast message="Processing" onClose={onClose} />
    );

    expect(html).toContain('duration-[5000ms]');
    expect(html).toContain('relative overflow-hidden');
  });
});
