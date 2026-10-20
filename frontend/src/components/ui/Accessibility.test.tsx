/**
 * ManageX Phase 10 — UI-005 Accessibility (WCAG 2.2 AA) Component Verification Test
 * Uses native React DOM server markup rendering for zero-dependency test verification.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './Button';
import { Input } from './Input';
import { FormField } from './FormField';
import { Dialog } from './Dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './Table';
import { Badge } from './Badge';

describe('Phase 10 — Accessibility Primitives Suite (UI-005)', () => {
  it('1. Button renders accessible visible focus classes and aria-busy when loading', () => {
    const normalHtml = renderToStaticMarkup(<Button>Submit Request</Button>);
    expect(normalHtml).toContain('focus-visible:ring-2');
    expect(normalHtml).toContain('Submit Request');

    const loadingHtml = renderToStaticMarkup(<Button isLoading>Submit Request</Button>);
    expect(loadingHtml).toContain('aria-busy="true"');
    expect(loadingHtml).toContain('disabled=""');
  });

  it('2. Input associates with error state via aria-invalid', () => {
    const html = renderToStaticMarkup(<Input placeholder="Enter username" hasError />);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('placeholder="Enter username"');
  });

  it('3. FormField connects label to input and announces errors with role="alert"', () => {
    const html = renderToStaticMarkup(
      <FormField label="Email Address" htmlFor="email-input" error="Email is required">
        <Input id="email-input" />
      </FormField>
    );

    expect(html).toContain('for="email-input"');
    expect(html).toContain('Email Address');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Email is required');
  });

  it('4. Dialog has role="dialog", aria-modal="true", and connects title and description', () => {
    const html = renderToStaticMarkup(
      <Dialog
        isOpen={true}
        onClose={() => {}}
        title="Confirm Deactivation"
        description="Are you sure you want to disable this workspace?"
      >
        <p>Dialog Body</p>
      </Dialog>
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="dialog-title"');
    expect(html).toContain('aria-describedby="dialog-description"');
    expect(html).toContain('id="dialog-title"');
    expect(html).toContain('id="dialog-description"');
    expect(html).toContain('aria-label="Close dialog"');
  });

  it('5. Table has semantic headers with scope="col"', () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project Name</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Platform Migration</TableCell>
            <TableCell>Active</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(html).toContain('<table');
    expect(html).toContain('<thead');
    expect(html).toContain('<th scope="col"');
    expect(html).toContain('Project Name');
  });

  it('6. Badge displays distinct accessible variants with compliant contrast classes', () => {
    const html = renderToStaticMarkup(<Badge variant="brand">In Progress</Badge>);
    expect(html).toContain('text-brand-700');
    expect(html).toContain('bg-brand-50');
  });
});
