// State Management
let appState = {
  ADHA: { name: 'ADHA', changes: [], selected: new Set() },
  CCISTTA: { name: 'CCISTTA', changes: [], selected: new Set() },
  currentDiff: {
    file: '',
    type: '', // 'local' or 'cross-project'
    sourceProject: '', // 'ADHA' or 'CCISTTA'
    diffText: ''
  }
};

const isBinaryFile = (path) => {
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.woff', '.woff2', '.ttf', '.eot'];
  const ext = '.' + path.split('.').pop().toLowerCase();
  return binaryExtensions.includes(ext);
};

// DOM Elements
const refreshBtn = document.getElementById('refresh-btn');
const countAdha = document.getElementById('count-adha');
const countCcistta = document.getElementById('count-ccistta');
const listAdha = document.getElementById('list-adha');
const listCcistta = document.getElementById('list-ccistta');
const searchAdha = document.getElementById('search-adha');
const searchCcistta = document.getElementById('search-ccistta');

// Modal Elements
const diffModal = document.getElementById('diff-modal');
const closeDiffModalBtn = document.getElementById('close-diff-modal');
const diffModalBadge = document.getElementById('diff-modal-badge');
const diffModalFilename = document.getElementById('diff-modal-filename');
const diffModalDesc = document.getElementById('diff-modal-desc');
const diffCodeBlock = document.getElementById('diff-code-block');
const modalDiscardBtn = document.getElementById('modal-discard-btn');
const modalSyncBtn = document.getElementById('modal-sync-btn');
const modalSyncText = document.getElementById('modal-sync-text');
const modalMergeBtn = document.getElementById('modal-merge-btn');

// Settings Elements
const configBtn = document.getElementById('config-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsModalBtn = document.getElementById('close-settings-modal');
const settingsCancelBtn = document.getElementById('settings-cancel-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const configPathA = document.getElementById('config-path-a');
const configPathB = document.getElementById('config-path-b');

// Toast Container
const toastContainer = document.getElementById('toast-container');

// Initialize Lucide Icons
function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Show Toast Message
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  if (type === 'info') iconName = 'info';

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span class="toast-message">${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  initIcons();

  // Trigger animation frame for show transition
  setTimeout(() => toast.classList.add('show'), 50);

  // Remove toast after 3.5 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Load and Render Statuses
async function fetchStatus() {
  // Start rotating refresh icon
  const icon = refreshBtn.querySelector('svg') || refreshBtn.querySelector('i');
  if (icon) icon.classList.add('spinning');
  
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    
    appState.ADHA.changes = data.ADHA.changes || [];
    appState.CCISTTA.changes = data.CCISTTA.changes || [];
    
    // Keep track of present paths
    const newAdhaPaths = new Set(appState.ADHA.changes.map(c => c.path));
    const newCcisttaPaths = new Set(appState.CCISTTA.changes.map(c => c.path));

    // Keep only elements that are still modified
    appState.ADHA.selected = new Set([...appState.ADHA.selected].filter(p => newAdhaPaths.has(p)));
    appState.CCISTTA.selected = new Set([...appState.CCISTTA.selected].filter(p => newCcisttaPaths.has(p)));

    // Add new changes to selected set by default
    appState.ADHA.changes.forEach(c => {
      if (!appState.ADHA.selected.has(c.path)) {
        appState.ADHA.selected.add(c.path);
      }
    });
    appState.CCISTTA.changes.forEach(c => {
      if (!appState.CCISTTA.selected.has(c.path)) {
        appState.CCISTTA.selected.add(c.path);
      }
    });

    appState.ADHA.name = data.ADHA.name || 'ADHA';
    appState.CCISTTA.name = data.CCISTTA.name || 'CCISTTA';
    
    // Update dynamically names/paths in the UI
    document.querySelector('.card-adha h3').textContent = appState.ADHA.name;
    document.getElementById('path-adha').textContent = data.ADHA.path;
    document.querySelector('#panel-adha h2').textContent = `${appState.ADHA.name} Changes`;
    document.querySelector('#sync-all-to-ccistta-btn span').textContent = `Sync All to ${appState.CCISTTA.name}`;

    document.querySelector('.card-ccistta h3').textContent = appState.CCISTTA.name;
    document.getElementById('path-ccistta').textContent = data.CCISTTA.path;
    document.querySelector('#panel-ccistta h2').textContent = `${appState.CCISTTA.name} Changes`;
    document.querySelector('#sync-all-to-adha-btn span').textContent = `Sync All to ${appState.ADHA.name}`;

    // Pre-fill paths f settings inputs
    configPathA.value = data.ADHA.path;
    configPathB.value = data.CCISTTA.path;
    
    renderLists();
    showToast('Fetched latest changes from git status.', 'info');
  } catch (error) {
    console.error('Error fetching git status:', error);
    showToast('Failed to fetch status: ' + error.message, 'error');
  } finally {
    const icon = refreshBtn.querySelector('svg') || refreshBtn.querySelector('i');
    if (icon) icon.classList.remove('spinning');
  }
}

function updateSyncButtonsState() {
  // ADHA (Source) to CCISTTA (Dest)
  const adhaSelected = appState.ADHA.selected.size;
  const adhaTotal = appState.ADHA.changes.length;
  const isAdhaAll = adhaSelected === adhaTotal && adhaTotal > 0;

  const syncAdhaBtn = document.getElementById('sync-all-to-ccistta-btn');
  if (syncAdhaBtn) {
    syncAdhaBtn.querySelector('span').textContent = isAdhaAll ? 'Sync All' : `Sync Selected (${adhaSelected})`;
    syncAdhaBtn.disabled = adhaSelected === 0;
  }

  const mergeAdhaBtn = document.getElementById('merge-all-to-ccistta-btn');
  if (mergeAdhaBtn) {
    mergeAdhaBtn.querySelector('span').textContent = isAdhaAll ? 'Smart Merge All' : `Smart Merge (${adhaSelected})`;
    mergeAdhaBtn.disabled = adhaSelected === 0;
  }

  const discardAdhaBtn = document.getElementById('discard-all-adha-btn');
  if (discardAdhaBtn) {
    discardAdhaBtn.querySelector('span').textContent = isAdhaAll ? 'Discard All' : `Discard Selected (${adhaSelected})`;
    discardAdhaBtn.disabled = adhaSelected === 0;
  }

  // CCISTTA (Source) to ADHA (Dest)
  const ccisttaSelected = appState.CCISTTA.selected.size;
  const ccisttaTotal = appState.CCISTTA.changes.length;
  const isCcisttaAll = ccisttaSelected === ccisttaTotal && ccisttaTotal > 0;

  const syncCcisttaBtn = document.getElementById('sync-all-to-adha-btn');
  if (syncCcisttaBtn) {
    syncCcisttaBtn.querySelector('span').textContent = isCcisttaAll ? 'Sync All' : `Sync Selected (${ccisttaSelected})`;
    syncCcisttaBtn.disabled = ccisttaSelected === 0;
  }

  const mergeCcisttaBtn = document.getElementById('merge-all-to-adha-btn');
  if (mergeCcisttaBtn) {
    mergeCcisttaBtn.querySelector('span').textContent = isCcisttaAll ? 'Smart Merge All' : `Smart Merge (${ccisttaSelected})`;
    mergeCcisttaBtn.disabled = ccisttaSelected === 0;
  }

  const discardCcisttaBtn = document.getElementById('discard-all-ccistta-btn');
  if (discardCcisttaBtn) {
    discardCcisttaBtn.querySelector('span').textContent = isCcisttaAll ? 'Discard All' : `Discard Selected (${ccisttaSelected})`;
    discardCcisttaBtn.disabled = ccisttaSelected === 0;
  }
}

function updateSelectAllState(proj) {
  const selectAllCheckbox = document.getElementById(`select-all-${proj.toLowerCase()}`);
  if (!selectAllCheckbox) return;

  const total = appState[proj].changes.length;
  const selected = appState[proj].selected.size;

  if (total === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    selectAllCheckbox.disabled = true;
  } else if (selected === total) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
    selectAllCheckbox.disabled = false;
  } else if (selected === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    selectAllCheckbox.disabled = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
    selectAllCheckbox.disabled = false;
  }
}

// Render File Lists based on current state & search inputs
function renderLists() {
  const adhaQuery = searchAdha.value.toLowerCase();
  const ccisttaQuery = searchCcistta.value.toLowerCase();
  
  // Filter changes
  const filteredAdha = appState.ADHA.changes.filter(change => 
    change.path.toLowerCase().includes(adhaQuery)
  );
  
  const filteredCcistta = appState.CCISTTA.changes.filter(change => 
    change.path.toLowerCase().includes(ccisttaQuery)
  );
  
  // Update badges
  countAdha.textContent = appState.ADHA.changes.length;
  countCcistta.textContent = appState.CCISTTA.changes.length;
  
  // Render ADHA Panel
  renderProjectList(filteredAdha, listAdha, 'ADHA', 'CCISTTA');
  // Render CCISTTA Panel
  renderProjectList(filteredCcistta, listCcistta, 'CCISTTA', 'ADHA');
  
  updateSelectAllState('ADHA');
  updateSelectAllState('CCISTTA');
  updateSyncButtonsState();
  
  initIcons();
}

// Render list for a specific project
function renderProjectList(changes, container, sourceProj, destProj) {
  if (changes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="check-circle" class="empty-state-icon"></i>
        <p>No changes found in project ${sourceProj}</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = changes.map(file => {
    const filename = file.path.split('/').pop();
    const directory = file.path.substring(0, file.path.length - filename.length - 1) || './';
    
    const statusCode = file.code; // M, A, D, ??
    const badgeClass = `badge-status badge-${statusCode.toLowerCase().replace('?', 'u')}`;
    const isSelected = appState[sourceProj].selected.has(file.path);
    
    return `
      <div class="file-item ${isSelected ? 'selected' : ''}" data-filepath="${file.path}">
        <div class="file-details">
          <input type="checkbox" class="file-select-checkbox" data-project="${sourceProj}" data-filepath="${file.path}" ${isSelected ? 'checked' : ''} style="accent-color: ${sourceProj === 'ADHA' ? 'var(--cyan)' : 'var(--pink)'}; cursor: pointer; width: 16px; height: 16px; flex-shrink: 0; margin-right: 0.5rem; margin-top: 0.15rem;">
          <div class="${badgeClass}">${statusCode}</div>
          <div class="file-meta">
            <span class="file-path">${filename}</span>
            <span class="file-dir">${directory}</span>
          </div>
        </div>
        <div class="file-actions">
          <button class="btn-icon" data-tooltip="Git Diff (Local)" onclick="showDiff('${file.path}', false, '${sourceProj}')">
            <i data-lucide="file-text"></i>
          </button>
          <button class="btn-icon" data-tooltip="Compare with ${destProj}" onclick="showDiff('${file.path}', true, '${sourceProj}')">
            <i data-lucide="git-compare"></i>
          </button>
          <button class="btn-icon" style="color: var(--emerald-text)" data-tooltip="Copy to ${destProj} (Overwrite)" onclick="syncFile('${file.path}', '${sourceProj}', '${destProj}', false)">
            <i data-lucide="arrow-right-left"></i>
          </button>
          ${!isBinaryFile(file.path) ? `
          <button class="btn-icon" style="color: var(--cyan)" data-tooltip="Smart Merge with ${destProj}" onclick="syncFile('${file.path}', '${sourceProj}', '${destProj}', true)">
            <i data-lucide="git-merge"></i>
          </button>
          ` : ''}
          <button class="btn-icon" style="color: var(--rose-text)" data-tooltip="Discard changes" onclick="discardChanges('${file.path}', '${sourceProj}')">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Wire up checkbox events
  container.querySelectorAll('.file-select-checkbox').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const path = e.target.getAttribute('data-filepath');
      const project = e.target.getAttribute('data-project');
      const itemRow = e.target.closest('.file-item');
      
      if (e.target.checked) {
        appState[project].selected.add(path);
        if (itemRow) itemRow.classList.add('selected');
      } else {
        appState[project].selected.delete(path);
        if (itemRow) itemRow.classList.remove('selected');
      }
      
      updateSelectAllState(project);
      updateSyncButtonsState();
    });
  });
}

// Open Diff Modal & fetch diff content
async function showDiff(filePath, compare = false, sourceProject = 'ADHA') {
  try {
    const compareQuery = compare ? 'true' : 'false';
    const response = await fetch(`/api/diff?file=${encodeURIComponent(filePath)}&compare=${compareQuery}&sourceProject=${sourceProject}`);
    const data = await response.json();
    
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }
    
    appState.currentDiff = {
      file: filePath,
      type: compare ? 'cross-project' : 'local',
      sourceProject: sourceProject,
      diffText: data.diff
    };
    
    // Fill Modal
    diffModalFilename.textContent = filePath.split('/').pop();
    diffModalDesc.textContent = filePath;
    
    const destProject = sourceProject === 'ADHA' ? 'CCISTTA' : 'ADHA';
    const isBinary = isBinaryFile(filePath);
    
    if (!isBinary) {
      modalMergeBtn.style.display = 'inline-flex';
      modalMergeBtn.onclick = () => syncFile(filePath, sourceProject, destProject, true);
    } else {
      modalMergeBtn.style.display = 'none';
    }

    if (compare) {
      diffModalBadge.textContent = 'A ⇄ B Compare';
      diffModalBadge.style.background = 'rgba(167, 139, 250, 0.15)';
      diffModalBadge.style.color = '#c084fc';
      diffModalBadge.style.borderColor = 'rgba(167, 139, 250, 0.3)';
      
      modalSyncText.textContent = `Sync: Overwrite ${destProject}`;
      modalSyncBtn.style.display = 'inline-flex';
      modalSyncBtn.onclick = () => syncFile(filePath, sourceProject, destProject, false);
    } else {
      diffModalBadge.textContent = `${sourceProject} Git Diff`;
      const sourceGlow = sourceProject === 'ADHA' ? 'var(--cyan-glow)' : 'var(--pink-glow)';
      const sourceColor = sourceProject === 'ADHA' ? 'var(--cyan)' : 'var(--pink)';
      diffModalBadge.style.background = sourceGlow;
      diffModalBadge.style.color = sourceColor;
      diffModalBadge.style.borderColor = sourceColor;

      modalSyncText.textContent = `Sync to ${destProject}`;
      modalSyncBtn.style.display = 'inline-flex';
      modalSyncBtn.onclick = () => syncFile(filePath, sourceProject, destProject, false);
    }
    
    modalDiscardBtn.onclick = () => discardChanges(filePath, sourceProject);
    
    // Render code diff with styling
    renderDiffContent(data.diff);
    
    // Show Modal
    diffModal.classList.add('active');
    initIcons();
  } catch (error) {
    console.error('Error fetching diff:', error);
    showToast('Failed to generate diff: ' + error.message, 'error');
  }
}

// Parse unified diff format into structured side-by-side rows
function parseDiffToSideBySide(diffText) {
  const lines = diffText.split('\n');
  const result = {
    headers: [],
    rows: []
  };

  let leftLineNum = 1;
  let rightLineNum = 1;
  
  let deletedAccumulator = [];
  let addedAccumulator = [];

  function flush() {
    const max = Math.max(deletedAccumulator.length, addedAccumulator.length);
    for (let i = 0; i < max; i++) {
      const del = deletedAccumulator[i];
      const add = addedAccumulator[i];
      
      result.rows.push({
        type: 'data',
        left: del ? { type: 'deleted', lineNum: del.lineNum, text: del.text } : { type: 'empty', lineNum: '', text: '' },
        right: add ? { type: 'added', lineNum: add.lineNum, text: add.text } : { type: 'empty', lineNum: '', text: '' }
      });
    }
    deletedAccumulator = [];
    addedAccumulator = [];
  }

  let inHeader = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty line at the very end
    if (i === lines.length - 1 && !line) continue;

    if (line.startsWith('@@')) {
      inHeader = false;
      flush();
      
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      if (match) {
        leftLineNum = parseInt(match[1]);
        rightLineNum = parseInt(match[2]);
        const context = match[3] || '';
        result.rows.push({
          type: 'chunk-header',
          text: `@@ -${leftLineNum} +${rightLineNum} @@${context}`
        });
      } else {
        result.rows.push({
          type: 'chunk-header',
          text: line
        });
      }
      continue;
    }

    if (inHeader) {
      result.headers.push(line);
      continue;
    }

    if (line.startsWith('\\')) {
      // Ignore git warnings like "\ No newline at end of file"
      continue;
    }

    if (line.startsWith('-')) {
      deletedAccumulator.push({
        lineNum: leftLineNum++,
        text: line.substring(1)
      });
    } else if (line.startsWith('+')) {
      addedAccumulator.push({
        lineNum: rightLineNum++,
        text: line.substring(1)
      });
    } else {
      // Unchanged line
      flush();
      const text = line.startsWith(' ') ? line.substring(1) : line;
      result.rows.push({
        type: 'data',
        left: { type: 'unchanged', lineNum: leftLineNum++, text: text },
        right: { type: 'unchanged', lineNum: rightLineNum++, text: text }
      });
    }
  }

  // Final flush
  flush();

  return result;
}

// Helper to escape HTML characters
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Render and style diff text in side-by-side table format
function renderDiffContent(diffText) {
  if (!diffText || !diffText.trim()) {
    diffCodeBlock.innerHTML = `<div class="diff-header-info">No differences found. The files are identical.</div>`;
    return;
  }
  
  const parsed = parseDiffToSideBySide(diffText);
  let html = '';
  
  // Render git headers if present
  if (parsed.headers.length > 0) {
    html += `<div class="diff-header-info">${parsed.headers.join('\n')}</div>`;
  }
  
  html += `
    <table class="diff-table">
      <colgroup>
        <col class="col-ln">
        <col class="col-content">
        <col class="col-ln">
        <col class="col-content">
      </colgroup>
      <tbody>
  `;
  
  for (const row of parsed.rows) {
    if (row.type === 'chunk-header') {
      html += `
        <tr class="diff-row-chunk-header">
          <td colspan="4" class="diff-chunk-header">${escapeHtml(row.text)}</td>
        </tr>
      `;
    } else {
      const left = row.left;
      const right = row.right;
      
      const leftClass = left.type === 'deleted' ? 'diff-deleted' : (left.type === 'empty' ? 'diff-empty' : 'diff-unchanged');
      const rightClass = right.type === 'added' ? 'diff-added' : (right.type === 'empty' ? 'diff-empty' : 'diff-unchanged');
      
      const leftIndicator = left.type === 'deleted' ? '-' : '';
      const rightIndicator = right.type === 'added' ? '+' : '';
      
      html += `
        <tr class="diff-row">
          <td class="line-num ${leftClass}">${left.lineNum}</td>
          <td class="line-content ${leftClass}"><span class="diff-indicator">${leftIndicator}</span>${escapeHtml(left.text)}</td>
          <td class="line-num ${rightClass}">${right.lineNum}</td>
          <td class="line-content ${rightClass}"><span class="diff-indicator">${rightIndicator}</span>${escapeHtml(right.text)}</td>
        </tr>
      `;
    }
  }
  
  html += `
      </tbody>
    </table>
  `;
  
  diffCodeBlock.innerHTML = html;
}

// Custom Confirmation Dialog (Non-blocking, glassmorphic UI)
function showConfirm(message, isDanger = false) {
  return new Promise((resolve) => {
    const confirmModal = document.getElementById('confirm-modal');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const closeConfirmBtn = document.getElementById('close-confirm-modal');
    const iconWrapper = confirmModal.querySelector('.confirm-icon-wrapper');

    confirmMessage.innerHTML = message;
    
    // Style Ok button depending on danger level
    if (isDanger) {
      confirmOkBtn.className = 'btn btn-outline-danger';
      iconWrapper.innerHTML = `<i data-lucide="alert-triangle" style="color: var(--rose-text)"></i>`;
    } else {
      confirmOkBtn.className = 'btn btn-success';
      iconWrapper.innerHTML = `<i data-lucide="help-circle" style="color: var(--emerald-text)"></i>`;
    }
    
    initIcons();

    function cleanup(value) {
      confirmModal.classList.remove('active');
      confirmOkBtn.onclick = null;
      confirmCancelBtn.onclick = null;
      closeConfirmBtn.onclick = null;
      resolve(value);
    }

    confirmOkBtn.onclick = () => cleanup(true);
    confirmCancelBtn.onclick = () => cleanup(false);
    closeConfirmBtn.onclick = () => cleanup(false);
    
    confirmModal.classList.add('active');
  });
}

// Copy File Operation
async function syncFile(filePath, fromProj, toProj, forceMerge = false) {
  const mergeJson = forceMerge;
  
  let confirmMessage = `Are you sure you want to copy <strong>${filePath.split('/').pop()}</strong> from <strong>${fromProj}</strong> to <strong>${toProj}</strong>?<br><br>`;
  if (mergeJson) {
    confirmMessage += `<span style="font-size: 0.85rem; color: var(--emerald-text)">This will perform a SMART MERGE, merging changes without discarding other code.</span>`;
  } else {
    confirmMessage += `<span style="font-size: 0.85rem; color: var(--text-muted)">This will OVERWRITE the destination file.</span>`;
  }

  const confirmed = await showConfirm(confirmMessage, false);
  
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filePath, from: fromProj, to: toProj, mergeJson })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(data.message, 'success');
      // If modal is active, close it
      diffModal.classList.remove('active');
      // Refresh statuses
      fetchStatus();
    } else {
      showToast(data.error || 'Copy failed', 'error');
    }
  } catch (error) {
    console.error('Error copying file:', error);
    showToast('Failed to sync file: ' + error.message, 'error');
  }
}

// Discard changes operation
async function discardChanges(filePath, project) {
  const confirmed = await showConfirm(
    `Are you sure you want to DISCARD local changes in <strong>${filePath.split('/').pop()}</strong> for project <strong>${project}</strong>?<br><br><span style="font-size: 0.85rem; color: var(--rose-text)">This action CANNOT be undone.</span>`,
    true
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await fetch('/api/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filePath, project: project })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(data.message, 'success');
      diffModal.classList.remove('active');
      fetchStatus();
    } else {
      showToast(data.error || 'Discard failed', 'error');
    }
  } catch (error) {
    console.error('Error discarding changes:', error);
    showToast('Failed to discard changes: ' + error.message, 'error');
  }
}

// Sync All/Selected Files Operation
async function syncAllFiles(fromProj, toProj, isSmartMerge = false) {
  const selectedFiles = Array.from(appState[fromProj].selected);
  const count = selectedFiles.length;
  
  if (count === 0) {
    showToast(`No files selected to sync in ${fromProj}.`, 'info');
    return;
  }
  
  const mergeJson = isSmartMerge;
  const totalCount = fromProj === 'ADHA' ? appState.ADHA.changes.length : appState.CCISTTA.changes.length;
  
  let confirmMessage = `Are you sure you want to ${isSmartMerge ? 'SMART MERGE' : 'SYNC'} <strong>${count === totalCount ? 'ALL ' : ''}${count} selected files</strong> from <strong>${fromProj}</strong> to <strong>${toProj}</strong>?<br><br>`;
  if (mergeJson) {
    confirmMessage += `<span style="font-size: 0.85rem; color: var(--emerald-text)">Matching JSON/text files will be SMART MERGED. Binary files will be overwritten.</span>`;
  } else {
    confirmMessage += `<span style="font-size: 0.85rem; color: var(--rose-text)">This will OVERWRITE the selected files in ${toProj}.</span>`;
  }

  const confirmed = await showConfirm(confirmMessage, true);
  
  if (!confirmed) {
    return;
  }
  
  try {
    showToast(`Starting sync of ${count} files...`, 'info');
    
    const response = await fetch('/api/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromProj, to: toProj, mergeJson, files: selectedFiles })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(data.message, 'success');
      fetchStatus();
    } else {
      showToast(data.error || 'Bulk sync failed', 'error');
    }
  } catch (error) {
    console.error('Error in bulk sync:', error);
    showToast('Failed to sync all files: ' + error.message, 'error');
  }
}

// Discard All/Selected Files Operation
async function discardAllFiles(project) {
  const selectedFiles = Array.from(appState[project].selected);
  const count = selectedFiles.length;

  if (count === 0) {
    showToast(`No files selected to discard in ${project}.`, 'info');
    return;
  }

  const totalCount = appState[project].changes.length;
  const isAll = count === totalCount;

  const confirmMessage = `Are you sure you want to <strong>DISCARD</strong> local changes in <strong>${isAll ? 'ALL ' : ''}${count} selected files</strong> for project <strong>${project}</strong>?<br><br>` +
    `<span style="font-size: 0.85rem; color: var(--rose-text)">This action is IRREVERSIBLE. Any unsaved edits will be permanently lost.</span>`;

  const confirmed = await showConfirm(confirmMessage, true);

  if (!confirmed) {
    return;
  }

  try {
    showToast(`Discarding changes in ${count} files...`, 'info');

    const response = await fetch('/api/discard-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, files: selectedFiles })
    });

    const data = await response.json();

    if (data.success) {
      showToast(data.message, 'success');
      fetchStatus();
    } else {
      showToast(data.error || 'Bulk discard failed', 'error');
    }
  } catch (error) {
    console.error('Error in bulk discard:', error);
    showToast('Failed to discard files: ' + error.message, 'error');
  }
}

// Event Listeners
refreshBtn.addEventListener('click', fetchStatus);

searchAdha.addEventListener('input', renderLists);
searchCcistta.addEventListener('input', renderLists);

const syncAllToCcisttaBtn = document.getElementById('sync-all-to-ccistta-btn');
const syncAllToAdhaBtn = document.getElementById('sync-all-to-adha-btn');
const mergeAllToCcisttaBtn = document.getElementById('merge-all-to-ccistta-btn');
const mergeAllToAdhaBtn = document.getElementById('merge-all-to-adha-btn');
const discardAllAdhaBtn = document.getElementById('discard-all-adha-btn');
const discardAllCcisttaBtn = document.getElementById('discard-all-ccistta-btn');

syncAllToCcisttaBtn.addEventListener('click', () => syncAllFiles('ADHA', 'CCISTTA', false));
syncAllToAdhaBtn.addEventListener('click', () => syncAllFiles('CCISTTA', 'ADHA', false));

mergeAllToCcisttaBtn.addEventListener('click', () => syncAllFiles('ADHA', 'CCISTTA', true));
mergeAllToAdhaBtn.addEventListener('click', () => syncAllFiles('CCISTTA', 'ADHA', true));

discardAllAdhaBtn.addEventListener('click', () => discardAllFiles('ADHA'));
discardAllCcisttaBtn.addEventListener('click', () => discardAllFiles('CCISTTA'));

// Settings Modal Actions
configBtn.addEventListener('click', () => {
  settingsModal.classList.add('active');
});

const closeSettings = () => {
  settingsModal.classList.remove('active');
};

closeSettingsModalBtn.addEventListener('click', closeSettings);
settingsCancelBtn.addEventListener('click', closeSettings);

settingsSaveBtn.addEventListener('click', async () => {
  const pathA = configPathA.value.trim();
  const pathB = configPathB.value.trim();

  if (!pathA || !pathB) {
    showToast('Please provide both project paths.', 'error');
    return;
  }

  try {
    settingsSaveBtn.disabled = true;
    settingsSaveBtn.textContent = 'Saving...';

    const response = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pathA, pathB })
    });

    const data = await response.json();

    if (data.success) {
      showToast(data.message, 'success');
      closeSettings();
      fetchStatus();
    } else {
      showToast(data.error || 'Failed to save configuration', 'error');
    }
  } catch (error) {
    console.error('Error saving config:', error);
    showToast('Failed to save config: ' + error.message, 'error');
  } finally {
    settingsSaveBtn.disabled = false;
    settingsSaveBtn.textContent = 'Save Configuration';
  }
});

// Close settings modal when clicking backdrop
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    closeSettings();
  }
});

// Close Modal
closeDiffModalBtn.addEventListener('click', () => {
  diffModal.classList.remove('active');
});

// Close modal when clicking backdrop
diffModal.addEventListener('click', (e) => {
  if (e.target === diffModal) {
    diffModal.classList.remove('active');
  }
});

// ESC key closes modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (diffModal.classList.contains('active')) {
      diffModal.classList.remove('active');
    }
    if (settingsModal.classList.contains('active')) {
      closeSettings();
    }
    if (document.getElementById('dir-picker-modal').classList.contains('active')) {
      document.getElementById('dir-picker-modal').classList.remove('active');
    }
  }
});

// Directory Picker Logic
let currentBrowsePath = '';
let activeTargetInput = null;

const dirPickerModal = document.getElementById('dir-picker-modal');
const closeDirPickerModalBtn = document.getElementById('close-dir-picker-modal');
const dirPickerCancelBtn = document.getElementById('dir-picker-cancel-btn');
const dirPickerSelectBtn = document.getElementById('dir-picker-select-btn');

async function openDirPicker(targetInput) {
  activeTargetInput = targetInput;
  const initialPath = targetInput.value.trim() || '/home';
  dirPickerModal.classList.add('active');
  await loadDir(initialPath);
}

const closeDirPicker = () => {
  dirPickerModal.classList.remove('active');
};

closeDirPickerModalBtn.addEventListener('click', closeDirPicker);
dirPickerCancelBtn.addEventListener('click', closeDirPicker);

dirPickerSelectBtn.addEventListener('click', () => {
  if (activeTargetInput && currentBrowsePath) {
    activeTargetInput.value = currentBrowsePath;
    closeDirPicker();
  }
});

async function loadDir(dirPath) {
  try {
    const response = await fetch(`/api/browse-dir?path=${encodeURIComponent(dirPath)}`);
    const data = await response.json();
    
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }
    
    currentBrowsePath = data.currentPath;
    document.getElementById('dir-picker-current-path').textContent = currentBrowsePath;
    
    const listContainer = document.getElementById('dir-picker-list');
    listContainer.innerHTML = '';
    
    // Add "Up one level" if parent exists
    if (data.parent) {
      const upItem = document.createElement('div');
      upItem.className = 'dir-picker-item';
      upItem.style.display = 'flex';
      upItem.style.alignItems = 'center';
      upItem.style.gap = '0.5rem';
      upItem.style.padding = '0.5rem';
      upItem.style.borderRadius = '6px';
      upItem.style.cursor = 'pointer';
      upItem.style.fontSize = '0.9rem';
      upItem.style.color = 'var(--text-main)';
      upItem.innerHTML = `
        <i data-lucide="corner-left-up" style="width: 16px; height: 16px; color: var(--cyan)"></i>
        <span style="font-weight: 500;">.. (Parent Directory)</span>
      `;
      upItem.addEventListener('click', () => loadDir(data.parent));
      listContainer.appendChild(upItem);
    }
    
    if (data.directories.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.padding = '1rem';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-muted)';
      emptyMsg.style.fontSize = '0.85rem';
      emptyMsg.textContent = 'No subdirectories found';
      listContainer.appendChild(emptyMsg);
    } else {
      for (const dirName of data.directories) {
        const item = document.createElement('div');
        item.className = 'dir-picker-item';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '0.5rem';
        item.style.padding = '0.5rem';
        item.style.borderRadius = '6px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '0.9rem';
        item.style.color = 'var(--text-main)';
        item.innerHTML = `
          <i data-lucide="folder" style="width: 16px; height: 16px; color: var(--cyan)"></i>
          <span>${dirName}</span>
        `;
        item.addEventListener('click', () => {
          const nextPath = currentBrowsePath === '/' ? `/${dirName}` : `${currentBrowsePath}/${dirName}`;
          loadDir(nextPath);
        });
        listContainer.appendChild(item);
      }
    }
    
    initIcons();
  } catch (error) {
    console.error('Error loading directory:', error);
    showToast('Failed to load directory: ' + error.message, 'error');
  }
}

// Bind "Browse..." buttons
document.querySelectorAll('.browse-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const targetBtn = e.target.closest('.browse-btn');
    const targetInputId = targetBtn.getAttribute('data-target');
    openDirPicker(document.getElementById(targetInputId));
  });
});

// Close directory picker when clicking backdrop
dirPickerModal.addEventListener('click', (e) => {
  if (e.target === dirPickerModal) {
    closeDirPicker();
  }
});

// Initial Page Load
document.addEventListener('DOMContentLoaded', () => {
  // Bind Select All Checkboxes
  const selectAllAdha = document.getElementById('select-all-adha');
  if (selectAllAdha) {
    selectAllAdha.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const adhaQuery = searchAdha.value.toLowerCase();
      const filtered = appState.ADHA.changes.filter(change => 
        change.path.toLowerCase().includes(adhaQuery)
      );
      
      if (isChecked) {
        filtered.forEach(c => appState.ADHA.selected.add(c.path));
      } else {
        filtered.forEach(c => appState.ADHA.selected.delete(c.path));
      }
      renderLists();
    });
  }

  const selectAllCcistta = document.getElementById('select-all-ccistta');
  if (selectAllCcistta) {
    selectAllCcistta.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const ccisttaQuery = searchCcistta.value.toLowerCase();
      const filtered = appState.CCISTTA.changes.filter(change => 
        change.path.toLowerCase().includes(ccisttaQuery)
      );
      
      if (isChecked) {
        filtered.forEach(c => appState.CCISTTA.selected.add(c.path));
      } else {
        filtered.forEach(c => appState.CCISTTA.selected.delete(c.path));
      }
      renderLists();
    });
  }

  fetchStatus();
});
