/**
 * ManageX Minimalist Standard PDF 1.4 Document Generator
 * Strictly adheres to PRD §8.1, §8.2, docs/meetings-mom-enhancement-roadmap.md §11.1, and security invariants.
 *
 * Implements a pure ES module PDF 1.4 generator using standard Type 1 fonts (Helvetica, Helvetica-Bold).
 * Requires zero native dependencies or large npm modules.
 */

/**
 * Escapes characters for PDF literal string syntax: ( ... )
 * Escapes backslash, open parenthesis, and close parenthesis.
 * Replaces non-printable ASCII characters with spaces.
 * @param {string} str
 * @returns {string}
 */
export function escapePdfString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');
}

/**
 * Wraps text into lines that fit within a maximum width.
 * Uses an average character width approximation for standard Helvetica.
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} fontSize
 * @returns {Array<string>}
 */
function wrapText(text, maxWidth, fontSize) {
  if (!text) return [];
  const approxCharWidth = fontSize * 0.52;
  const maxCharsPerLine = Math.max(10, Math.floor(maxWidth / approxCharWidth));

  const paragraphs = text.split('\n');
  const resultLines = [];

  for (const para of paragraphs) {
    if (para.length <= maxCharsPerLine) {
      resultLines.push(para);
      continue;
    }

    const words = para.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) resultLines.push(currentLine);
        // If a single word is longer than maxCharsPerLine, break it
        if (word.length > maxCharsPerLine) {
          let remainder = word;
          while (remainder.length > maxCharsPerLine) {
            resultLines.push(remainder.substring(0, maxCharsPerLine));
            remainder = remainder.substring(maxCharsPerLine);
          }
          currentLine = remainder;
        } else {
          currentLine = word;
        }
      }
    }
    if (currentLine) resultLines.push(currentLine);
  }

  return resultLines;
}

/**
 * Generates a valid standard PDF 1.4 binary Buffer for meeting minutes.
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
 * @returns {Buffer}
 */
export function generateMeetingPdf({
  meeting,
  attendees = [],
  agendaItems = [],
  discussionPoints = [],
  decisions = [],
  actionItems = [],
  notes = null,
  canAccessNotes = false,
}) {
  const pageWidth = 595.28; // Standard A4 width in points
  const pageHeight = 841.89; // Standard A4 height in points
  const leftMargin = 50;
  const rightMargin = 545;
  const contentWidth = rightMargin - leftMargin;

  const pages = [];
  let currentPageCommands = [];
  let currentY = pageHeight - 50;

  function startNewPage() {
    if (currentPageCommands.length > 0) {
      pages.push(currentPageCommands.join('\n'));
      currentPageCommands = [];
    }
    currentY = pageHeight - 50;

    // Running header
    currentPageCommands.push('q');
    currentPageCommands.push('0.4 0.4 0.4 rg');
    currentPageCommands.push('BT');
    currentPageCommands.push('/F1 8 Tf');
    currentPageCommands.push(`${leftMargin} ${pageHeight - 30} Td`);
    currentPageCommands.push(`(${escapePdfString('ManageX Meeting Minutes — ' + meeting.title)}) Tj`);
    currentPageCommands.push('ET');
    currentPageCommands.push('0.85 0.85 0.85 RG 0.5 w');
    currentPageCommands.push(`${leftMargin} ${pageHeight - 34} m ${rightMargin} ${pageHeight - 34} l S`);
    currentPageCommands.push('Q');
  }

  function ensureSpace(neededHeight) {
    if (currentY - neededHeight < 50) {
      startNewPage();
    }
  }

  function addText(text, { font = 'F1', size = 10, color = '0 0 0', indent = 0 } = {}) {
    const lines = wrapText(text, contentWidth - indent, size);
    const lineHeight = size * 1.35;

    for (const line of lines) {
      ensureSpace(lineHeight);
      currentPageCommands.push('q');
      currentPageCommands.push(`${color} rg`);
      currentPageCommands.push('BT');
      currentPageCommands.push(`/${font} ${size} Tf`);
      currentPageCommands.push(`${leftMargin + indent} ${currentY - size} Td`);
      currentPageCommands.push(`(${escapePdfString(line)}) Tj`);
      currentPageCommands.push('ET');
      currentPageCommands.push('Q');
      currentY -= lineHeight;
    }
  }

  function addDivider() {
    ensureSpace(15);
    currentPageCommands.push('q');
    currentPageCommands.push('0.85 0.85 0.85 RG 0.75 w');
    currentPageCommands.push(`${leftMargin} ${currentY - 5} m ${rightMargin} ${currentY - 5} l S`);
    currentPageCommands.push('Q');
    currentY -= 15;
  }

  function addSectionHeader(title) {
    ensureSpace(28);
    currentY -= 8;
    currentPageCommands.push('q');
    // Subtle background bar for section header
    currentPageCommands.push('0.95 0.96 0.98 rg');
    currentPageCommands.push(`${leftMargin} ${currentY - 18} ${contentWidth} 20 re f`);
    currentPageCommands.push('0.2 0.25 0.35 rg');
    currentPageCommands.push('BT');
    currentPageCommands.push('/F2 11 Tf');
    currentPageCommands.push(`${leftMargin + 6} ${currentY - 14} Td`);
    currentPageCommands.push(`(${escapePdfString(title)}) Tj`);
    currentPageCommands.push('ET');
    currentPageCommands.push('Q');
    currentY -= 26;
  }

  // --- Document Construction ---
  startNewPage();

  // Document Title Header
  currentPageCommands.push('q');
  currentPageCommands.push('0.15 0.2 0.4 rg');
  currentPageCommands.push('BT');
  currentPageCommands.push('/F2 20 Tf');
  currentPageCommands.push(`${leftMargin} ${currentY - 20} Td`);
  currentPageCommands.push(`(${escapePdfString(meeting.title)}) Tj`);
  currentPageCommands.push('ET');
  currentPageCommands.push('Q');
  currentY -= 32;

  // Metadata Subheader
  const dateStr = `${new Date(meeting.start_at).toLocaleString()} – ${new Date(meeting.end_at).toLocaleString()} (${meeting.timezone || 'UTC'})`;
  addText(dateStr, { font: 'F1', size: 9, color: '0.35 0.35 0.35' });
  addText(`Status: ${meeting.status.toUpperCase()}   |   Type: ${meeting.location_type || 'virtual'}` +
    (meeting.location ? `   |   Location: ${meeting.location}` : '') +
    (meeting.virtual_url ? `   |   URL: ${meeting.virtual_url}` : ''), { font: 'F1', size: 9, color: '0.35 0.35 0.35' });

  if (meeting.description) {
    currentY -= 4;
    addText(meeting.description, { font: 'F1', size: 9.5, color: '0.25 0.25 0.25' });
  }

  addDivider();

  // 1. Attendees
  addSectionHeader('1. Attendees & Attendance');
  if (attendees.length === 0) {
    addText('No attendees recorded.', { font: 'F1', size: 9, color: '0.5 0.5 0.5', indent: 6 });
  } else {
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
      const role = att.role || 'participant';
      const rsvp = att.rsvpStatus || 'pending';
      addText(`• ${displayName} — Role: ${role} | RSVP: ${rsvp.toUpperCase()}`, { font: 'F1', size: 9, indent: 8 });
    }
  }

  // 2. Agenda Items
  addSectionHeader('2. Agenda');
  if (agendaItems.length === 0) {
    addText('No agenda items scheduled.', { font: 'F1', size: 9, color: '0.5 0.5 0.5', indent: 6 });
  } else {
    agendaItems.forEach((item, idx) => {
      const dur = item.durationMinutes ? ` (${item.durationMinutes} mins)` : '';
      addText(`${idx + 1}. ${item.title}${dur}`, { font: 'F2', size: 9.5, indent: 6 });
      if (item.description) {
        addText(item.description, { font: 'F1', size: 9, color: '0.3 0.3 0.3', indent: 16 });
      }
    });
  }

  // 3. Discussion Points
  addSectionHeader('3. Discussion Points');
  if (discussionPoints.length === 0) {
    addText('No discussion points recorded.', { font: 'F1', size: 9, color: '0.5 0.5 0.5', indent: 6 });
  } else {
    discussionPoints.forEach((point, idx) => {
      addText(`3.${idx + 1}  ${point.title}`, { font: 'F2', size: 9.5, indent: 6 });
      if (point.body) {
        addText(point.body, { font: 'F1', size: 9, color: '0.2 0.2 0.2', indent: 16 });
      } else {
        addText('Draft point (no notes recorded).', { font: 'F1', size: 8.5, color: '0.55 0.55 0.55', indent: 16 });
      }
      currentY -= 3;
    });
  }

  // 4. Key Decisions
  addSectionHeader('4. Key Decisions');
  if (decisions.length === 0) {
    addText('No formal decisions recorded.', { font: 'F1', size: 9, color: '0.5 0.5 0.5', indent: 6 });
  } else {
    decisions.forEach((dec, idx) => {
      addText(`[Decision ${idx + 1}]  ${dec.title}`, { font: 'F2', size: 9.5, color: '0.1 0.4 0.2', indent: 6 });
      if (dec.details) {
        addText(dec.details, { font: 'F1', size: 9, color: '0.25 0.25 0.25', indent: 16 });
      }
      currentY -= 3;
    });
  }

  // 5. Action Items
  addSectionHeader('5. Action Items');
  if (actionItems.length === 0) {
    addText('No action items assigned.', { font: 'F1', size: 9, color: '0.5 0.5 0.5', indent: 6 });
  } else {
    actionItems.forEach((ai, idx) => {
      const assignee = ai.assigneeName || ai.assigneeEmail || 'Unassigned';
      const due = ai.dueDate ? new Date(ai.dueDate).toISOString().split('T')[0] : 'None';
      const decLink = ai.decisionTitle ? ` (Decision: ${ai.decisionTitle})` : '';
      addText(`${idx + 1}. [${ai.status.toUpperCase()}] ${ai.title}`, { font: 'F2', size: 9.5, indent: 6 });
      addText(`Assignee: ${assignee}  |  Priority: ${ai.priority.toUpperCase()}  |  Due: ${due}${decLink}`, {
        font: 'F1',
        size: 8.5,
        color: '0.35 0.35 0.35',
        indent: 16,
      });
      currentY -= 2;
    });
  }

  // 6. Confidential Minutes
  addSectionHeader('6. Additional Notes & Minutes');
  if (!canAccessNotes) {
    addText('[Confidential notes omitted — restricted to authorised meeting organisers and roles]', {
      font: 'F1',
      size: 9,
      color: '0.7 0.2 0.2',
      indent: 6,
    });
  } else if (!notes || !notes.content || notes.content.trim().length === 0) {
    addText('No additional confidential notes recorded.', { font: 'F1', size: 9, color: '0.5 0.5 0.5', indent: 6 });
  } else {
    addText(notes.content, { font: 'F1', size: 9, color: '0.2 0.2 0.2', indent: 6 });
  }

  // Push final page commands
  if (currentPageCommands.length > 0) {
    pages.push(currentPageCommands.join('\n'));
  }

  // --- Assemble Valid Standard PDF 1.4 Binary ---
  const objects = [];
  function addObject(content) {
    objects.push(content);
    return objects.length; // 1-indexed object id
  }

  // Object 1: Catalog (placeholder, updated after Pages)
  const catalogObjIndex = 1;
  const pagesObjIndex = 2;
  const fontRegularObjIndex = 3;
  const fontBoldObjIndex = 4;

  // Reserve slots
  objects.push(''); // 1 Catalog
  objects.push(''); // 2 Pages
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); // 3 F1
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'); // 4 F2

  const pageObjectIds = [];

  for (let i = 0; i < pages.length; i++) {
    const contentStream = pages[i];
    const streamLen = Buffer.byteLength(contentStream, 'utf-8');

    // Content stream object
    const streamObjId = addObject(`<< /Length ${streamLen} >>\nstream\n${contentStream}\nendstream`);

    // Page object
    const pageObjId = addObject(`<<
  /Type /Page
  /Parent ${pagesObjIndex} 0 R
  /MediaBox [0 0 ${pageWidth} ${pageHeight}]
  /Contents ${streamObjId} 0 R
  /Resources <<
    /Font <<
      /F1 ${fontRegularObjIndex} 0 R
      /F2 ${fontBoldObjIndex} 0 R
    >>
  >>
>>`);
    pageObjectIds.push(pageObjId);
  }

  // Update Catalog & Pages
  objects[catalogObjIndex - 1] = `<< /Type /Catalog /Pages ${pagesObjIndex} 0 R >>`;
  objects[pagesObjIndex - 1] = `<<
  /Type /Pages
  /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}]
  /Count ${pageObjectIds.length}
>>`;

  // Build binary buffer
  let pdfOutput = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdfOutput, 'utf-8'));
    pdfOutput += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdfOutput, 'utf-8');
  pdfOutput += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let i = 0; i < objects.length; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    pdfOutput += `${offStr} 00000 n \n`;
  }

  pdfOutput += `trailer\n<<\n  /Size ${objects.length + 1}\n  /Root ${catalogObjIndex} 0 R\n>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdfOutput, 'utf-8');
}
