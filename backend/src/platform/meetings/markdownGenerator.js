/**
 * ManageX Meeting Minutes Markdown Document Generator
 * Strictly adheres to PRD §8.1, §8.2, docs/meetings-mom-enhancement-roadmap.md §11.1, and security invariants.
 *
 * Invariants:
 * - Escapes raw HTML entities to prevent markdown-based HTML injection.
 * - Confirms user permissions before including confidential notes.
 * - Formats dates, times, attendees, agendas, discussion points, decisions, and action items cleanly.
 */

/**
 * Escapes characters that could be interpreted as executable HTML or malformed markdown tags.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeMarkdown(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Generates formatted Markdown string for a meeting.
 *
 * @param {object} params
 * @param {object} params.meeting
 * @param {Array<object>} params.attendees
 * @param {Array<object>} params.agendaItems
 * @param {Array<object>} params.discussionPoints
 * @param {Array<object>} params.decisions
 * @param {Array<object>} params.actionItems
 * @param {object|null} params.notes
 * @param {boolean} params.canAccessNotes
 * @returns {string}
 */
export function generateMeetingMarkdown({
  meeting,
  attendees = [],
  agendaItems = [],
  discussionPoints = [],
  decisions = [],
  actionItems = [],
  notes = null,
  canAccessNotes = false,
}) {
  const lines = [];

  // Title & Metadata Header
  lines.push(`# Meeting Minutes: ${sanitizeMarkdown(meeting.title)}`);
  lines.push('');
  lines.push(`**Date & Time:** ${new Date(meeting.start_at).toLocaleString()} – ${new Date(meeting.end_at).toLocaleString()}`);
  lines.push(`**Timezone:** ${meeting.timezone || 'UTC'}`);
  lines.push(`**Status:** ${meeting.status.toUpperCase()}`);
  lines.push(`**Location Type:** ${meeting.location_type || 'virtual'}`);
  if (meeting.location) {
    lines.push(`**Location:** ${sanitizeMarkdown(meeting.location)}`);
  }
  if (meeting.virtual_url) {
    lines.push(`**Meeting URL:** ${sanitizeMarkdown(meeting.virtual_url)}`);
  }
  if (meeting.organiser_name || meeting.organiser_email) {
    lines.push(`**Organiser:** ${sanitizeMarkdown(meeting.organiser_name || meeting.organiser_email)}`);
  }
  if (meeting.description) {
    lines.push('');
    lines.push('### Overview');
    lines.push(sanitizeMarkdown(meeting.description));
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. Attendees Section
  lines.push('## 1. Attendees & Attendance');
  lines.push('');
  if (attendees.length === 0) {
    lines.push('*No attendees recorded.*');
  } else {
    lines.push('| Name / Email | Role | RSVP Status |');
    lines.push('| :--- | :--- | :--- |');
    for (const att of attendees) {
      let displayName = att.fullName || att.userName || att.userEmail || att.externalEmail || 'Unknown';
      const email = att.email || att.userEmail || att.externalEmail;
      if (att.fullName && email && att.fullName !== email) {
        displayName = `${att.fullName} (${email})`;
      } else if (att.userName && email && att.userName !== email) {
        displayName = `${att.userName} (${email})`;
      } else if (att.isExternal && att.externalEmail) {
        displayName = `${att.externalEmail} (External)`;
      }
      const name = sanitizeMarkdown(displayName);
      const role = sanitizeMarkdown(att.role || 'participant');
      const rsvp = sanitizeMarkdown(att.rsvpStatus || 'pending');
      lines.push(`| ${name} | ${role} | ${rsvp} |`);
    }
  }
  lines.push('');

  // 2. Agenda Items Section
  lines.push('## 2. Agenda');
  lines.push('');
  if (agendaItems.length === 0) {
    lines.push('*No agenda items scheduled.*');
  } else {
    agendaItems.forEach((item, idx) => {
      const duration = item.durationMinutes ? ` (${item.durationMinutes} mins)` : '';
      lines.push(`${idx + 1}. **${sanitizeMarkdown(item.title)}**${duration}`);
      if (item.description) {
        lines.push(`   ${sanitizeMarkdown(item.description)}`);
      }
    });
  }
  lines.push('');

  // 3. Discussion Points Section
  lines.push('## 3. Discussion Points');
  lines.push('');
  if (discussionPoints.length === 0) {
    lines.push('*No discussion points recorded.*');
  } else {
    discussionPoints.forEach((point, idx) => {
      lines.push(`### 3.${idx + 1} ${sanitizeMarkdown(point.title)}`);
      if (point.body) {
        lines.push(sanitizeMarkdown(point.body));
      } else {
        lines.push('*Draft point (no notes recorded).*');
      }
      lines.push('');
    });
  }
  lines.push('');

  // 4. Decisions Section
  lines.push('## 4. Key Decisions');
  lines.push('');
  if (decisions.length === 0) {
    lines.push('*No formal decisions recorded.*');
  } else {
    decisions.forEach((dec, idx) => {
      lines.push(`${idx + 1}. **${sanitizeMarkdown(dec.title)}**`);
      if (dec.details) {
        lines.push(`   - Details: ${sanitizeMarkdown(dec.details)}`);
      }
    });
  }
  lines.push('');

  // 5. Action Items Section
  lines.push('## 5. Action Items');
  lines.push('');
  if (actionItems.length === 0) {
    lines.push('*No action items assigned.*');
  } else {
    lines.push('| Title | Assignee | Priority | Due Date | Status | Linked Decision |');
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');
    for (const ai of actionItems) {
      const title = sanitizeMarkdown(ai.title);
      const assignee = sanitizeMarkdown(ai.assigneeName || ai.assigneeEmail || 'Unassigned');
      const priority = sanitizeMarkdown(ai.priority || 'medium');
      const dueDate = ai.dueDate ? new Date(ai.dueDate).toISOString().split('T')[0] : 'None';
      const status = sanitizeMarkdown(ai.status || 'open');
      const decision = sanitizeMarkdown(ai.decisionTitle || 'None');
      lines.push(`| ${title} | ${assignee} | ${priority} | ${dueDate} | ${status} | ${decision} |`);
    }
  }
  lines.push('');

  // 6. Confidential Notes / Minutes Section
  lines.push('## 6. Additional Notes & Minutes');
  lines.push('');
  if (!canAccessNotes) {
    lines.push('*[Confidential notes omitted — restricted to authorised meeting organisers and roles]*');
  } else if (!notes || !notes.content || notes.content.trim().length === 0) {
    lines.push('*No additional confidential notes recorded.*');
  } else {
    lines.push(sanitizeMarkdown(notes.content));
  }
  lines.push('');

  return lines.join('\n');
}
