/* ═══════════════════════════════════════════════════════════
   Beri Knowledge Base Editor — app.js
   All state in JS variables + localStorage. No frameworks.
═══════════════════════════════════════════════════════════ */

// ── STATE ──────────────────────────────────────────────────
let sections = [];          // [{id, original, current, title}]
let currentIndex = 0;
let filename = '';
let originalFullMarkdown = '';
let renderedLo = 0;         // Index of the first card currently in the DOM
let isNavigating = false;   // Block nav clicks during slide transition
let reviewPendingAction = null; // 'export' | 'email' | null

const STORAGE_KEY        = 'beri_habs_md_cache';
const STORAGE_FILENAME   = 'beri_habs_filename';
const TOUR_COMPLETE_KEY  = 'beri_tour_complete';
const TOUR_RESUME_KEY    = 'beri_tour_resume_step';

// ── TOUR STEPS ─────────────────────────────────────────────
const TOUR_STEPS = [
  {
    title: 'Welcome to the Beri Knowledge Base Editor',
    content: 'This tool helps you review and update your school\'s knowledge base content. Follow this short tour to learn the full workflow — it takes less than two minutes!',
    target: null,
    position: 'center',
    screen: 'any'
  },
  {
    title: 'Upload your .md file',
    content: 'Drag and drop the markdown file we\'ve provided into this area, or click "browse files" to select it from your computer. Only .md files are accepted.',
    target: '#drop-zone',
    position: 'bottom',
    screen: 'upload',
    pauseHere: true
  },
  {
    title: 'Edit section content',
    content: 'Your file is split into sections shown as cards. The left pane shows the raw Markdown — edit directly here. The right pane shows a live preview that updates as you type.',
    target: '.flashcard-panes',
    position: 'top',
    screen: 'editor'
  },
  {
    title: 'Format your content',
    content: 'Use the toolbar to format text: Bold, Italic, Headings (H2, H3), Tables, Bullet and Numbered lists. Select text first, then click a button to wrap it with the correct Markdown.',
    target: '.editor-toolbar',
    position: 'bottom',
    screen: 'editor'
  },
  {
    title: 'Cite your sources',
    content: 'Every section must have a source. Click "Source" to insert a **Source:** line, then replace the placeholder URL with a publicly accessible link — for example an Issuu booklet or a page on the school website.',
    targetQuery: 'button[title="Insert Source line"]',
    position: 'bottom',
    screen: 'editor'
  },
  {
    title: 'Add or delete sections',
    content: 'Need to include information not covered by existing sections? Click "+ New Section" to add a blank section. To remove a section, click "Delete Section" — you\'ll be asked to confirm before anything is removed.',
    targetQuery: '.toolbar-add-section',
    position: 'bottom',
    screen: 'editor'
  },
  {
    title: 'Table of Contents',
    content: 'Click "Contents" to see all sections in one place — a table showing each heading and which ones you\'ve edited. Click any row to jump straight to that section.',
    targetQuery: '#btn-toc',
    position: 'bottom',
    screen: 'editor'
  },
  {
    title: 'Export your updated file',
    content: 'When you\'re satisfied with your edits, click "Export .md". You\'ll be taken to the review screen first so you can confirm your changes before the file downloads.',
    targetQuery: '#btn-export-md',
    position: 'top',
    screen: 'editor'
  },
  {
    title: 'Email your file to Beri',
    content: 'Finally, click "Email to BERI". The review screen opens first — once you confirm, a dialog will show the address, a ready-to-use message, and remind you to attach the exported file.',
    targetQuery: '#btn-email-beri',
    position: 'top',
    screen: 'editor'
  }
];

let tourCurrentStep = 0;

// ── INIT ───────────────────────────────────────────────────
(function init() {
  var cached, cachedFn;
  try {
    cached   = localStorage.getItem(STORAGE_KEY);
    cachedFn = localStorage.getItem(STORAGE_FILENAME);
  } catch (e) {
    // localStorage blocked by browser policy (common on school/managed devices)
  }

  if (cached) {
    const box = document.getElementById('resume-box');
    const fn  = document.getElementById('resume-filename');
    box.classList.add('visible');
    fn.textContent = cachedFn || 'knowledge-base.md';

    document.getElementById('btn-resume').onclick = function() {
      filename = cachedFn || 'knowledge-base.md';
      loadMarkdown(cached);
    };

    document.getElementById('btn-discard-cache').onclick = function() {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_FILENAME);
      } catch (e) {}
      box.classList.remove('visible');
    };
  }

  setupDropZone();
  setupFileInput();
  setupKeyboard();
  initTourCheck();
})();

// ── FILE HANDLING ──────────────────────────────────────────
function setupDropZone() {
  const dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', function(e) {
    e.preventDefault();
    dz.classList.add('dragover');
  });
  dz.addEventListener('dragleave', function() {
    dz.classList.remove('dragover');
  });
  dz.addEventListener('drop', function(e) {
    e.preventDefault();
    dz.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });
}

function setupFileInput() {
  document.getElementById('file-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) readFile(file);
  });
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    filename = file.name;
    const md = e.target.result;
    try {
      localStorage.setItem(STORAGE_KEY, md);
      localStorage.setItem(STORAGE_FILENAME, filename);
    } catch (err) {
      showToast('File too large to save locally — changes won\'t persist between sessions.', 'warn');
    }
    loadMarkdown(md);
  };
  reader.readAsText(file);
}

// ── MARKDOWN → SECTIONS ────────────────────────────────────
function loadMarkdown(md) {
  originalFullMarkdown = md;
  sections = parseMarkdownToSections(md);
  currentIndex = 0;
  renderEditor();
  showScreen('editor-screen');
  updateHeader();
  updateNavButtons();
  document.getElementById('footer-filename').textContent = filename;
  maybeResumeTour();
}

function parseMarkdownToSections(md) {
  const rawSections = splitByHeadings(md);
  const result = [];
  rawSections.forEach(function(raw, i) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const title = extractSectionTitle(trimmed);
    result.push({
      id: 'sec_' + i + '_' + Date.now(),
      original: trimmed,
      current: trimmed,
      title: title
    });
  });
  return result;
}

function splitByHeadings(md) {
  // Normalize CRLF/CR → LF so heading regexes work on Windows-authored files
  const normalized = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const chunks = [];
  let current = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) {
      // New heading: flush the previous section
      if (current.length > 0) {
        const text = current.join('\n').trim();
        if (text) chunks.push(text);
        current = [];
      }
    }
    current.push(line);
  }
  // Flush the final section
  if (current.length > 0) {
    const text = current.join('\n').trim();
    if (text) chunks.push(text);
  }
  return chunks;
}

function extractSectionTitle(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,6}\s+(.+)/);
    if (m) return m[1].trim();
  }
  return 'Untitled Section';
}

// ── RENDER EDITOR ──────────────────────────────────────────
// Only renders a ±1 window around currentIndex so large files load instantly.
function renderEditor() {
  const track = document.getElementById('flashcard-track');
  track.innerHTML = '';

  const lo = Math.max(0, currentIndex - 1);
  const hi = Math.min(sections.length - 1, currentIndex + 1);
  renderedLo = lo;

  for (let i = lo; i <= hi; i++) {
    buildAndAppendCard(i);
  }

  track.style.transition = 'none';
  track.style.transform = 'translateX(-' + ((currentIndex - renderedLo) * 100) + '%)';
}

function buildAndAppendCard(idx) {
  if (idx < 0 || idx >= sections.length) return null;
  const existing = document.getElementById('card_' + idx);
  if (existing) return existing;

  const track = document.getElementById('flashcard-track');
  const sec = sections[idx];

  const card = document.createElement('div');
  card.className = 'flashcard';
  card.id = 'card_' + idx;
  card.dataset.idx = String(idx);

  const panes = document.createElement('div');
  panes.className = 'flashcard-panes';

  // Editor pane
  const editorPane = document.createElement('div');
  editorPane.className = 'pane pane-editor';

  const editorLabel = document.createElement('div');
  editorLabel.className = 'pane-label';
  editorLabel.textContent = 'Markdown';

  const textarea = document.createElement('textarea');
  textarea.className = 'pane-editor-textarea';
  textarea.id = 'textarea_' + idx;
  textarea.value = sec.current;
  textarea.spellcheck = true;

  const previewPane = document.createElement('div');
  previewPane.className = 'pane pane-preview';
  previewPane.id = 'preview_' + idx;
  previewPane.innerHTML = renderMarkdown(sec.current);

  // Debounced preview update — avoids re-rendering on every keystroke
  let previewTimer;
  textarea.addEventListener('input', function() {
    sections[idx].current = textarea.value;
    sections[idx].title = extractSectionTitle(textarea.value);
    if (idx === currentIndex) updateHeader();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function() {
      previewPane.innerHTML = renderMarkdown(textarea.value);
    }, 150);
  });

  editorPane.appendChild(editorLabel);
  editorPane.appendChild(textarea);

  const previewLabel = document.createElement('div');
  previewLabel.className = 'pane-label';
  previewLabel.textContent = 'Preview';

  const previewWrapper = document.createElement('div');
  previewWrapper.className = 'pane';
  previewWrapper.appendChild(previewLabel);
  previewWrapper.appendChild(previewPane);

  panes.appendChild(editorPane);
  panes.appendChild(previewWrapper);
  card.appendChild(panes);

  // Insert in sorted order so the DOM always mirrors section order
  let inserted = false;
  for (const sibling of track.children) {
    if (parseInt(sibling.dataset.idx) > idx) {
      track.insertBefore(card, sibling);
      inserted = true;
      break;
    }
  }
  if (!inserted) track.appendChild(card);

  return card;
}

// ── NAVIGATION ─────────────────────────────────────────────
function navigate(dir) {
  if (isNavigating) return;
  const next = currentIndex + dir;
  if (next < 0 || next >= sections.length) return;

  const track = document.getElementById('flashcard-track');
  isNavigating = true;

  if (dir > 0) {
    // Going right: ensure the target card exists in the DOM before sliding
    buildAndAppendCard(next);
    currentIndex = next;
    track.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    track.style.transform = 'translateX(-' + ((currentIndex - renderedLo) * 100) + '%)';
  } else {
    // Going left: if the target card isn't rendered yet, prepend it and
    // snap the track position (invisible) before animating forward.
    if (!document.getElementById('card_' + next)) {
      buildAndAppendCard(next);
      renderedLo = next;
      track.style.transition = 'none';
      track.style.transform = 'translateX(-' + ((currentIndex - renderedLo) * 100) + '%)';
      track.getBoundingClientRect(); // force reflow so snap takes effect before transition
    }
    currentIndex = next;
    track.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    track.style.transform = 'translateX(-' + ((currentIndex - renderedLo) * 100) + '%)';
  }

  updateHeader();
  updateNavButtons();

  // After the slide completes, trim the DOM back to the ±1 window
  let settled = false;
  function settle() {
    if (settled) return;
    settled = true;
    track.removeEventListener('transitionend', settle);
    cleanupWindow();
    isNavigating = false;
  }
  track.addEventListener('transitionend', settle);
  setTimeout(settle, 500); // fallback if transitionend doesn't fire
}

function cleanupWindow() {
  const track = document.getElementById('flashcard-track');
  const lo = Math.max(0, currentIndex - 1);
  const hi = Math.min(sections.length - 1, currentIndex + 1);

  // Remove cards that have drifted outside the ±1 window
  const toRemove = [];
  for (const card of track.children) {
    const idx = parseInt(card.dataset.idx);
    if (idx < lo || idx > hi) toRemove.push(card);
  }
  toRemove.forEach(function(c) { track.removeChild(c); });

  // Fill any gaps within the window (e.g. the neighbour in the new direction)
  for (let i = lo; i <= hi; i++) {
    buildAndAppendCard(i);
  }

  // Recalculate renderedLo after DOM changes
  if (track.children.length > 0) {
    renderedLo = parseInt(track.children[0].dataset.idx);
  }

  // Silently reposition the track — the visible card doesn't change
  track.style.transition = 'none';
  track.style.transform = 'translateX(-' + ((currentIndex - renderedLo) * 100) + '%)';
}

function updateHeader() {
  const sec = sections[currentIndex];
  if (!sec) return;
  document.getElementById('header-section-title').textContent = sec.title;
  document.getElementById('section-counter').textContent = (currentIndex + 1) + ' / ' + sections.length;
}

function updateNavButtons() {
  document.getElementById('btn-prev').disabled = currentIndex === 0;
  document.getElementById('btn-next').disabled = currentIndex === sections.length - 1;
}

function setupKeyboard() {
  document.addEventListener('keydown', function(e) {
    const tag = document.activeElement.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    if (e.key === 'ArrowLeft')  navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
  });
}

// ── TOOLBAR ACTIONS ────────────────────────────────────────
function insertFormat(type) {
  const ta = document.getElementById('textarea_' + currentIndex);
  if (!ta) return;
  ta.focus();

  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.substring(start, end);
  const before = ta.value.substring(0, start);
  const after  = ta.value.substring(end);

  let insert = '';
  let cursorOffset = 0;

  switch (type) {
    case 'bold':
      insert = '**' + (sel || 'bold text') + '**';
      cursorOffset = sel ? insert.length : 2;
      break;
    case 'italic':
      insert = '*' + (sel || 'italic text') + '*';
      cursorOffset = sel ? insert.length : 1;
      break;
    case 'h2':
      insert = '\n## ' + (sel || 'Section Heading') + '\n';
      cursorOffset = insert.length;
      break;
    case 'h3':
      insert = '\n### ' + (sel || 'Sub-heading') + '\n';
      cursorOffset = insert.length;
      break;
    case 'table':
      insert = '\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |\n';
      cursorOffset = insert.length;
      break;
    case 'bullet':
      insert = '\n- ' + (sel || 'Item') + '\n';
      cursorOffset = insert.length;
      break;
    case 'numbered':
      insert = '\n1. ' + (sel || 'Item') + '\n';
      cursorOffset = insert.length;
      break;
    case 'source':
      insert = '\n**Source:** https://www.habselstree.org.uk/girls/\n';
      cursorOffset = insert.length;
      break;
    case 'divider':
      insert = '\n---\n';
      cursorOffset = insert.length;
      break;
  }

  ta.value = before + insert + after;
  ta.selectionStart = ta.selectionEnd = start + cursorOffset;

  sections[currentIndex].current = ta.value;
  sections[currentIndex].title = extractSectionTitle(ta.value);
  document.getElementById('preview_' + currentIndex).innerHTML = renderMarkdown(ta.value);
  updateHeader();
}

// ── ADD NEW SECTION ────────────────────────────────────────
function addNewSection() {
  const template = '## New Section\n\n[content here]\n\n**Source:** https://www.habselstree.org.uk/girls/';
  const newSec = {
    id: 'sec_new_' + Date.now(),
    original: '',
    current: template,
    title: 'New Section'
  };
  sections.push(newSec);
  currentIndex = sections.length - 1; // set before renderEditor so window is correct
  renderEditor();
  updateHeader();
  updateNavButtons();
  showToast('New section added', 'info');
}

// ── DELETE SECTION ─────────────────────────────────────────
function openDeleteModal() {
  if (!sections.length) return;
  if (currentIndex === 0) {
    showToast('The first section cannot be deleted', 'error');
    return;
  }
  const sec = sections[currentIndex];
  const titleEl = document.getElementById('delete-preview-title');
  const snippetEl = document.getElementById('delete-preview-snippet');

  const titleLine = (sec.current || '').split('\n').find(function(l) { return /^#{1,6}\s/.test(l); });
  titleEl.textContent = titleLine ? titleLine.replace(/^#{1,6}\s+/, '') : (sec.title || 'Untitled');

  const bodyLines = (sec.current || '').split('\n').filter(function(l) { return !/^#{1,6}\s/.test(l) && l.trim(); });
  snippetEl.textContent = bodyLines.slice(0, 3).join(' ').slice(0, 200) || '(no content)';

  document.getElementById('delete-section-modal').classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('delete-section-modal').classList.remove('open');
}

function confirmDeleteSection() {
  if (sections.length <= 1) {
    showToast('Cannot delete the only remaining section', 'error');
    closeDeleteModal();
    return;
  }
  const removed = sections.splice(currentIndex, 1)[0];
  if (currentIndex >= sections.length) currentIndex = sections.length - 1;
  closeDeleteModal();
  renderEditor();
  updateHeader();
  updateNavButtons();
  showToast('Section "' + (removed.title || 'Untitled') + '" deleted', 'info');
}

// ── MARKDOWN RENDERER ──────────────────────────────────────
function renderMarkdown(md) {
  if (!md) return '';
  // Normalize CRLF/CR → LF so all regex patterns work on Windows-authored files
  const lines = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) { i++; continue; }

    // Horizontal rule (standalone --- not in table context)
    if (/^---+$/.test(trimmed) && !isTableSeparatorLine(trimmed)) {
      html += '<hr>';
      i++;
      continue;
    }

    // # through ###### headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html += '<h' + level + '>' + renderInline(headingMatch[2]) + '</h' + level + '>';
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      let bqContent = '';
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        bqContent += renderInline(lines[i].trim().replace(/^>\s?/, '')) + ' ';
        i++;
      }
      html += '<blockquote><p>' + bqContent.trim() + '</p></blockquote>';
      continue;
    }

    // Table (line starts with |)
    if (/^\|/.test(trimmed)) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        tableLines.push(lines[i]);
        i++;
      }
      html += renderTable(tableLines);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      html += '<ul>';
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        const item = lines[i].trim().replace(/^[-*+]\s/, '');
        html += '<li>' + renderInline(item) + '</li>';
        i++;
      }
      html += '</ul>';
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(trimmed)) {
      html += '<ol>';
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const item = lines[i].trim().replace(/^\d+\.\s/, '');
        html += '<li>' + renderInline(item) + '</li>';
        i++;
      }
      html += '</ol>';
      continue;
    }

    // Source line — distinct style
    if (/^\*\*Source:\*\*/.test(trimmed)) {
      const content = renderInline(trimmed);
      html += '<div class="source-line">' + content + '</div>';
      i++;
      continue;
    }

    // Paragraph
    let para = '';
    const paraStart = i;
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l) break;
      if (/^(#{1,6}\s|>|[-*+]\s|\d+\.\s|---+$|\||\*\*Source:)/.test(l)) break;
      para += (para ? ' ' : '') + l;
      i++;
    }
    // Safety: if no line was consumed (unrecognised pattern fell through every
    // block check AND immediately broke the paragraph guard), advance past it
    // rather than looping forever.
    if (i === paraStart) i++;
    if (para) html += '<p>' + renderInline(para) + '</p>';
  }

  return html;
}

function isTableSeparatorLine(s) {
  return /^\|[-| :]+\|/.test(s);
}

// A separator row has cells containing only dashes and optional alignment colons.
function isSeparatorRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return false;
  const cells = trimmed.split('|').slice(1, -1);
  return cells.length > 0 && cells.every(function(c) {
    return /^\s*:?-+:?\s*$/.test(c);
  });
}

function renderTable(lines) {
  const origLines = lines.filter(function(l) { return l.trim(); });
  if (!origLines.length) return '';

  // Second line is a separator → first row is a header
  const hasSeparator = origLines.length > 1 && isSeparatorRow(origLines[1]);

  // Exclude separator lines from rendered rows
  const rows = origLines.filter(function(l) { return !isSeparatorRow(l); });
  if (!rows.length) return '';

  let html = '<table>';
  rows.forEach(function(row, idx) {
    const parts = row.trim().split('|');
    const cells = parts.slice(1, parts.length - 1);
    if (idx === 0 && hasSeparator) {
      html += '<thead><tr>';
      cells.forEach(function(c) { html += '<th>' + renderInline(c.trim()) + '</th>'; });
      html += '</tr></thead><tbody>';
    } else {
      html += '<tr>';
      cells.forEach(function(c) { html += '<td>' + renderInline(c.trim()) + '</td>'; });
      html += '</tr>';
    }
  });
  if (hasSeparator) html += '</tbody>';
  html += '</table>';
  return html;
}

function renderInline(text) {
  if (!text) return '';

  // Escape HTML first
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // **bold** (but not **Source:**  — handled at block level, but let's keep bold working)
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // *italic* — bold pass already consumed **, so any remaining * is a single asterisk
  text = text.replace(/\*([^*\r\n]+)\*/g, '<em>$1</em>');

  // [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // bare URLs
  text = text.replace(/(https?:\/\/[^\s<>"]+)/g, function(url) {
    // Don't double-wrap already linked text
    if (text.indexOf('href="' + url + '"') !== -1) return url;
    return '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
  });

  return text;
}

// ── TABLE OF CONTENTS ─────────────────────────────────────
function openToc() {
  const body = document.getElementById('toc-body');
  body.innerHTML = '';

  const table = document.createElement('table');
  table.className = 'toc-table';

  sections.forEach(function(sec, idx) {
    const row = document.createElement('tr');
    if (idx === currentIndex) row.className = 'toc-current';

    const numCell = document.createElement('td');
    numCell.className = 'toc-num';
    numCell.textContent = idx + 1;

    const titleCell = document.createElement('td');
    titleCell.className = 'toc-title';
    titleCell.textContent = sec.title;

    const statusCell = document.createElement('td');
    statusCell.className = 'toc-status';
    if (sec.current.trim() !== sec.original.trim()) {
      const dot = document.createElement('span');
      dot.className = 'toc-edited-dot';
      dot.title = 'Edited';
      statusCell.appendChild(dot);
    }

    row.appendChild(numCell);
    row.appendChild(titleCell);
    row.appendChild(statusCell);

    row.onclick = function() {
      navigateToIndex(idx);
      closeToc();
    };

    table.appendChild(row);
  });

  body.appendChild(table);
  document.getElementById('toc-panel').classList.add('open');
}

function closeToc() {
  document.getElementById('toc-panel').classList.remove('open');
}

function navigateToIndex(idx) {
  if (idx < 0 || idx >= sections.length) return;
  currentIndex = idx;
  renderEditor();
  updateHeader();
  updateNavButtons();
}

// ── REVIEW PANEL ──────────────────────────────────────────
function openReview(action) {
  if (action && typeof action !== 'string') action = null;
  reviewPendingAction = action || null;

  const changed = sections.filter(function(s) {
    return s.current.trim() !== s.original.trim();
  });

  // If opened from Review Changes button and no changes, show toast instead
  if (!action && !changed.length) {
    showToast('No changes to review yet.', 'info');
    return;
  }

  document.getElementById('review-filename').textContent = filename || 'knowledge-base.md';
  document.getElementById('review-badge').textContent = changed.length
    ? changed.length + ' section' + (changed.length === 1 ? '' : 's') + ' changed'
    : 'No changes';

  const body = document.getElementById('review-body');
  body.innerHTML = '';

  if (!changed.length) {
    body.innerHTML = '<div class="review-empty">No changes to review — your file matches the original.</div>';
  }

  changed.forEach(function(sec) {
    const card = document.createElement('div');
    card.className = 'review-section-card';

    const titleEl = document.createElement('div');
    titleEl.className = 'review-section-title';
    titleEl.textContent = sec.title;
    card.appendChild(titleEl);

    const diffEl = document.createElement('div');
    diffEl.className = 'review-diff';

    const leftCol = buildDiffColumn('Original', sec.original, 'left');
    const rightCol = buildDiffColumn('Your edits', sec.current, 'right');

    // Mark columns if content changed
    if (sec.original.trim() && !sec.current.trim()) {
      leftCol.classList.add('diff-removed');
      rightCol.querySelector('.review-diff-content').innerHTML = '<span class="diff-empty-note">Removed — no replacement added.</span>';
    } else {
      applyLineDiff(leftCol, rightCol, sec.original, sec.current);
    }

    diffEl.appendChild(leftCol);
    diffEl.appendChild(rightCol);
    card.appendChild(diffEl);
    body.appendChild(card);
  });

  // Update confirm button label based on action
  const confirmBtn = document.getElementById('btn-review-confirm');
  if (confirmBtn) {
    if (action === 'export') {
      confirmBtn.textContent = 'Confirm & Export .md';
    } else if (action === 'email') {
      confirmBtn.textContent = 'Confirm & Email to BERI';
    } else {
      confirmBtn.innerHTML = 'Confirm &amp; save';
    }
  }

  document.getElementById('review-panel').classList.add('open');
}

function buildDiffColumn(label, md, side) {
  const col = document.createElement('div');
  col.className = 'review-diff-col';

  const header = document.createElement('div');
  header.className = 'review-diff-header';
  header.textContent = label;

  const content = document.createElement('div');
  content.className = 'review-diff-content';
  content.innerHTML = renderMarkdown(md);

  col.appendChild(header);
  col.appendChild(content);
  return col;
}

function applyLineDiff(leftCol, rightCol, origMd, currMd) {
  const origLines = origMd.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  const currLines = currMd.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);

  const origSet = new Set(origLines);
  const currSet = new Set(currLines);

  const hasRemovals = origLines.some(function(l) { return !currSet.has(l); });
  const hasAdditions = currLines.some(function(l) { return !origSet.has(l); });

  if (hasRemovals) leftCol.classList.add('diff-removed');
  if (hasAdditions) rightCol.classList.add('diff-added');
}

function closeReview() {
  reviewPendingAction = null;
  const confirmBtn = document.getElementById('btn-review-confirm');
  if (confirmBtn) confirmBtn.innerHTML = 'Confirm &amp; save';
  document.getElementById('review-panel').classList.remove('open');
}

function discardAllChanges() {
  if (!confirm('Discard all changes and revert to the original file?')) return;
  sections.forEach(function(s) { s.current = s.original; });
  renderEditor();
  updateHeader();
  closeReview();
  showToast('All changes discarded.', 'warn');
}

function confirmSave() {
  const md = sectionsToMarkdown();
  try {
    localStorage.setItem(STORAGE_KEY, md);
  } catch (err) {
    showToast('Could not save — storage quota exceeded.', 'warn');
  }

  const action = reviewPendingAction;
  closeReview(); // also clears reviewPendingAction

  if (action === 'export') {
    doExportMarkdown();
    showToast('Saved & exported ✓', 'amber');
  } else if (action === 'email') {
    showToast('Saved to browser ✓', 'amber');
    doEmailToBeri();
  } else {
    showToast('Saved to browser ✓', 'amber');
  }
}

// Wire up review button
document.getElementById('btn-review').onclick = function() { openReview(); };

// ── SECTIONS → MARKDOWN ────────────────────────────────────
function sectionsToMarkdown() {
  return sections.map(function(s) {
    return s.current.trim();
  }).join('\n\n');
}

// ── SAVE & EXPORT ──────────────────────────────────────────
function exportMarkdown() {
  openReview('export');
}

function doExportMarkdown() {
  const md = sectionsToMarkdown();
  const fn = filename || 'habs-knowledge-base-export.md';
  downloadFile(fn, md, 'text/markdown');
}

function emailToBeri() {
  openReview('email');
}

function doEmailToBeri() {
  const today = new Date().toISOString().split('T')[0];
  const subject = 'Knowledge Base Update — ' + (filename || today);
  document.getElementById('email-subject-preview').textContent = subject;
  document.getElementById('email-modal').classList.add('open');
}

function closeEmailModal() {
  document.getElementById('email-modal').classList.remove('open');
}

function copyEmailAddress() {
  navigator.clipboard.writeText('beri.ai.model@gmail.com').then(function() {
    showToast('Email address copied!', 'info');
  }).catch(function() {
    showToast('beri.ai.model@gmail.com', 'info');
  });
}

function openEmailClient() {
  const today = new Date().toISOString().split('T')[0];
  const subject = encodeURIComponent('Knowledge Base Update — ' + (filename || today));
  const body = encodeURIComponent(
    'Hi Beri team,\n\nPlease find attached my updated knowledge base file. I have reviewed the content and made the necessary edits.\n\nPlease let me know if you need anything else.\n\nBest regards'
  );
  window.open('mailto:beri.ai.model@gmail.com?subject=' + subject + '&body=' + body);
}

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── TOUR ───────────────────────────────────────────────────
function initTourCheck() {
  try {
    const done = localStorage.getItem(TOUR_COMPLETE_KEY);
    if (!done) {
      setTimeout(function() { startTour(0); }, 600);
    }
  } catch(e) {}
}

function maybeResumeTour() {
  try {
    const step = localStorage.getItem(TOUR_RESUME_KEY);
    if (step !== null && !localStorage.getItem(TOUR_COMPLETE_KEY)) {
      localStorage.removeItem(TOUR_RESUME_KEY);
      setTimeout(function() { startTour(parseInt(step, 10)); }, 400);
    }
  } catch(e) {}
}

function startTour(fromStep) {
  // Build dots once
  const dotsEl = document.getElementById('tour-dots');
  dotsEl.innerHTML = '';
  TOUR_STEPS.forEach(function(_, i) {
    const dot = document.createElement('span');
    dot.className = 'tour-dot';
    dot.dataset.step = String(i);
    dotsEl.appendChild(dot);
  });

  document.getElementById('tour-overlay').classList.add('active');
  showTourStep(fromStep);
}

function showTourStep(stepIdx) {
  if (stepIdx < 0 || stepIdx >= TOUR_STEPS.length) {
    endTour();
    return;
  }

  tourCurrentStep = stepIdx;
  const step = TOUR_STEPS[stepIdx];

  // Remove previous spotlight
  document.querySelectorAll('.tour-highlight').forEach(function(el) {
    el.classList.remove('tour-highlight');
  });

  // Update content
  document.getElementById('tour-step-num').textContent = 'Step ' + (stepIdx + 1) + ' of ' + TOUR_STEPS.length;
  document.getElementById('tour-title').textContent = step.title;
  document.getElementById('tour-content').textContent = step.content;

  // Update dots
  document.querySelectorAll('.tour-dot').forEach(function(dot, i) {
    dot.classList.toggle('active', i === stepIdx);
  });

  // Update buttons
  const prevBtn = document.getElementById('tour-prev');
  const nextBtn = document.getElementById('tour-next');
  prevBtn.style.visibility = stepIdx === 0 ? 'hidden' : '';
  nextBtn.textContent = stepIdx === TOUR_STEPS.length - 1 ? 'Done ✓' : 'Next →';

  // Find target element (only if on the right screen)
  const targetSelector = step.targetQuery || step.target;
  const activeScreen = (document.querySelector('.screen.active') || {}).id;
  const onRightScreen = step.screen === 'any' ||
    (step.screen === 'upload' && activeScreen === 'upload-screen') ||
    (step.screen === 'editor' && activeScreen === 'editor-screen');

  let targetEl = null;
  if (targetSelector && onRightScreen) {
    targetEl = document.querySelector(targetSelector);
    if (targetEl) {
      targetEl.classList.add('tour-highlight');
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  positionTourTooltip(targetEl, step.position);
}

function positionTourTooltip(targetEl, preferredPosition) {
  const tooltip = document.getElementById('tour-tooltip');
  tooltip.classList.remove('arrow-top', 'arrow-bottom');

  if (!targetEl) {
    tooltip.style.top = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
    return;
  }

  tooltip.style.transform = '';
  const rect = targetEl.getBoundingClientRect();
  const tw = 340;
  const margin = 14;
  const arrowSize = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipH = tooltip.offsetHeight || 220;

  let top, left, arrowXPct;

  const spaceBelow = vh - rect.bottom - margin - arrowSize;
  const spaceAbove = rect.top - margin - arrowSize;

  if (preferredPosition === 'bottom' && spaceBelow >= tooltipH) {
    top = rect.bottom + margin + arrowSize;
    left = rect.left + rect.width / 2 - tw / 2;
    tooltip.classList.add('arrow-top');
  } else if (preferredPosition === 'top' && spaceAbove >= tooltipH) {
    top = rect.top - tooltipH - margin - arrowSize;
    left = rect.left + rect.width / 2 - tw / 2;
    tooltip.classList.add('arrow-bottom');
  } else if (spaceBelow >= tooltipH) {
    top = rect.bottom + margin + arrowSize;
    left = rect.left + rect.width / 2 - tw / 2;
    tooltip.classList.add('arrow-top');
  } else {
    top = Math.max(margin, rect.top - tooltipH - margin - arrowSize);
    left = rect.left + rect.width / 2 - tw / 2;
    tooltip.classList.add('arrow-bottom');
  }

  // Clamp to viewport
  left = Math.max(margin, Math.min(left, vw - tw - margin));
  top  = Math.max(margin, Math.min(top,  vh - tooltipH - margin));

  // Position arrow correctly relative to target center within clamped tooltip
  const targetCenterX = rect.left + rect.width / 2;
  const arrowX = Math.max(20, Math.min(targetCenterX - left, tw - 20));
  tooltip.style.setProperty('--arrow-x', arrowX + 'px');

  tooltip.style.top  = top  + 'px';
  tooltip.style.left = left + 'px';
}

function tourNext() {
  const step = TOUR_STEPS[tourCurrentStep];
  const activeScreen = (document.querySelector('.screen.active') || {}).id;

  // Pause here if on upload screen and this step marks the hand-off to editor
  if (step.pauseHere && activeScreen === 'upload-screen') {
    try { localStorage.setItem(TOUR_RESUME_KEY, String(tourCurrentStep + 1)); } catch(e) {}
    closeTourOverlay();
    showToast('Upload your file — the tour will continue in the editor.', 'info');
    return;
  }

  if (tourCurrentStep >= TOUR_STEPS.length - 1) {
    endTour();
  } else {
    showTourStep(tourCurrentStep + 1);
  }
}

function tourPrev() {
  if (tourCurrentStep > 0) {
    showTourStep(tourCurrentStep - 1);
  }
}

function endTour() {
  try { localStorage.setItem(TOUR_COMPLETE_KEY, '1'); } catch(e) {}
  closeTourOverlay();
  if (tourCurrentStep >= TOUR_STEPS.length - 1) {
    showToast('Tour complete! Click "Tour" anytime to replay.', 'info');
  }
}

function closeTourOverlay() {
  document.getElementById('tour-overlay').classList.remove('active');
  document.querySelectorAll('.tour-highlight').forEach(function(el) {
    el.classList.remove('tour-highlight');
  });
}

// ── SOURCE LINE WARNING ─────────────────────────────────────
function checkForSourceLine(sectionIndex) {
  const sec = sections[sectionIndex];
  if (sec && !/\*\*Source:\*\*/.test(sec.current)) {
    showToast('Missing **Source:** line in this section.', 'warn');
  }
}

// Auto-warn when leaving a section
document.getElementById('btn-prev').addEventListener('click', function() {
  checkForSourceLine(currentIndex);
}, true);
document.getElementById('btn-next').addEventListener('click', function() {
  checkForSourceLine(currentIndex);
}, true);

// ── SCREEN SWITCHING ───────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) {
    s.classList.remove('active');
  });
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ── TOAST ──────────────────────────────────────────────────
function showToast(message, type) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      toast.classList.add('show');
    });
  });

  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, 3000);
}
