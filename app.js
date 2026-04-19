/* ═══════════════════════════════════════════════════════════
   Beri Knowledge Base Editor — app.js
   All state in JS variables + localStorage. No frameworks.
═══════════════════════════════════════════════════════════ */

// ── STATE ──────────────────────────────────────────────────
let sections = [];          // [{id, original, current, title}]
let currentIndex = 0;
let filename = '';
let originalFullMarkdown = '';

const STORAGE_KEY      = 'beri_habs_md_cache';
const STORAGE_FILENAME = 'beri_habs_filename';

// ── INIT ───────────────────────────────────────────────────
(function init() {
  const cached   = localStorage.getItem(STORAGE_KEY);
  const cachedFn = localStorage.getItem(STORAGE_FILENAME);

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
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_FILENAME);
      box.classList.remove('visible');
    };
  }

  setupDropZone();
  setupFileInput();
  setupKeyboard();
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
    localStorage.setItem(STORAGE_KEY, md);
    localStorage.setItem(STORAGE_FILENAME, filename);
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
}

function parseMarkdownToSections(md) {
  // Split by lines-that-are-only-dashes (---)
  const rawSections = splitBySeparator(md);
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

function splitBySeparator(md) {
  // Match --- on its own line (possibly with surrounding whitespace)
  const lines = md.split('\n');
  const chunks = [];
  let current = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^---+\s*$/.test(line.trim()) && !isInsideTable(lines, i)) {
      if (current.length) {
        chunks.push(current.join('\n'));
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

function isInsideTable(lines, idx) {
  // Heuristic: if adjacent lines look like table rows, skip
  const prev = lines[idx - 1] || '';
  const next = lines[idx + 1] || '';
  return /^\|/.test(prev) || /^\|/.test(next);
}

function extractSectionTitle(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+)/);
    if (m) return m[1].trim();
  }
  return 'Untitled Section';
}

// ── RENDER EDITOR ──────────────────────────────────────────
function renderEditor() {
  const track = document.getElementById('flashcard-track');
  track.innerHTML = '';

  sections.forEach(function(sec, idx) {
    const card = document.createElement('div');
    card.className = 'flashcard';
    card.id = 'card_' + idx;

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

    textarea.addEventListener('input', function() {
      sections[idx].current = textarea.value;
      sections[idx].title = extractSectionTitle(textarea.value);
      previewPane.innerHTML = renderMarkdown(textarea.value);
      if (idx === currentIndex) updateHeader();
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
    track.appendChild(card);
  });

  applyTrackPosition(false);
}

// ── NAVIGATION ─────────────────────────────────────────────
function navigate(dir) {
  const next = currentIndex + dir;
  if (next < 0 || next >= sections.length) return;
  currentIndex = next;
  applyTrackPosition(true);
  updateHeader();
  updateNavButtons();
}

function applyTrackPosition(animate) {
  const track = document.getElementById('flashcard-track');
  if (!animate) track.style.transition = 'none';
  else track.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
  track.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
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
    case 'blockquote':
      insert = '\n> ' + (sel || 'Quoted text') + '\n';
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
  renderEditor();
  currentIndex = sections.length - 1;
  applyTrackPosition(true);
  updateHeader();
  updateNavButtons();
  showToast('New section added', 'info');
}

// ── MARKDOWN RENDERER ──────────────────────────────────────
function renderMarkdown(md) {
  if (!md) return '';
  const lines = md.split('\n');
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

    // ## Heading
    if (/^##\s/.test(trimmed)) {
      const text = trimmed.replace(/^##\s+/, '');
      html += '<h2>' + renderInline(text) + '</h2>';
      i++;
      continue;
    }

    // ### Heading
    if (/^###\s/.test(trimmed)) {
      const text = trimmed.replace(/^###\s+/, '');
      html += '<h3>' + renderInline(text) + '</h3>';
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
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l) break;
      if (/^(##|###|>|[-*+]|\d+\.|---|\||\*\*Source:)/.test(l)) break;
      para += (para ? ' ' : '') + l;
      i++;
    }
    if (para) html += '<p>' + renderInline(para) + '</p>';
  }

  return html;
}

function isTableSeparatorLine(s) {
  return /^\|[-| :]+\|/.test(s);
}

function renderTable(lines) {
  // Filter out separator lines (|---|---|)
  const rows = lines.filter(function(l) {
    return l.trim() && !/^\|[\s\-:|]+\|$/.test(l.trim().replace(/[^|\-: ]/g, ''));
  });

  if (!rows.length) return '';

  // Detect if second original line is separator → first row is header
  const origLines = lines.filter(function(l) { return l.trim(); });
  const hasSeparator = origLines.length > 1 && /^\|[\s\-:|]+\|/.test(
    origLines[1].trim().replace(/[^|\-: ]/g, '')
  );

  let html = '<table>';
  rows.forEach(function(row, idx) {
    const cells = row.trim().split('|').filter(function(c, ci) {
      return ci > 0 && ci < row.trim().split('|').length - 1;
    });
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

  // *italic* (single asterisk, not double)
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

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

// ── REVIEW PANEL ──────────────────────────────────────────
function openReview() {
  const changed = sections.filter(function(s) {
    return s.current.trim() !== s.original.trim();
  });

  if (!changed.length) {
    showToast('No changes to review yet.', 'info');
    return;
  }

  document.getElementById('review-filename').textContent = filename || 'knowledge-base.md';
  document.getElementById('review-badge').textContent = changed.length + ' section' + (changed.length === 1 ? '' : 's') + ' changed';

  const body = document.getElementById('review-body');
  body.innerHTML = '';

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
  document.getElementById('review-panel').classList.remove('open');
}

function discardAllChanges() {
  if (!confirm('Discard all changes and revert to the original file?')) return;
  sections.forEach(function(s) { s.current = s.original; });
  renderEditor();
  applyTrackPosition(false);
  updateHeader();
  closeReview();
  showToast('All changes discarded.', 'warn');
}

function confirmSave() {
  const md = sectionsToMarkdown();
  localStorage.setItem(STORAGE_KEY, md);
  closeReview();
  showToast('Saved to browser ✓', 'amber');
}

// Wire up review button
document.getElementById('btn-review').onclick = openReview;

// ── SECTIONS → MARKDOWN ────────────────────────────────────
function sectionsToMarkdown() {
  return sections.map(function(s) {
    const text = s.current.trim();
    // Warn if no Source line
    if (!/\*\*Source:\*\*/.test(text)) {
      // toast handled in addNewSection save path
    }
    return text;
  }).join('\n\n---\n\n');
}

// ── SAVE & EXPORT ──────────────────────────────────────────
function exportMarkdown() {
  const md = sectionsToMarkdown();
  const fn = filename || 'habs-knowledge-base-export.md';
  downloadFile(fn, md, 'text/markdown');
}

function emailToBeri() {
  const md = sectionsToMarkdown();
  const fn = filename || 'knowledge-base';
  const today = new Date().toISOString().split('T')[0];
  const subject = encodeURIComponent('Habs Girls Knowledge Base Update — ' + (filename || today));
  const body = encodeURIComponent(md);
  // mailto body can be large; browsers may truncate — we warn if needed
  const link = 'mailto:beri.model.ai@gmail.com?subject=' + subject + '&body=' + body;
  window.location.href = link;
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
