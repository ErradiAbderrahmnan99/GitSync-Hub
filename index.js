const express = require('express');
const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isBinaryFile = (filePath) => {
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.woff', '.woff2', '.ttf', '.eot'];
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.includes(ext);
};

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load environment variables from .env if it exists
const ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE)) {
  try {
    const envContent = fs.readFileSync(ENV_FILE, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const firstEquals = trimmed.indexOf('=');
        if (firstEquals !== -1) {
          const key = trimmed.slice(0, firstEquals).trim();
          const value = trimmed.slice(firstEquals + 1).trim().replace(/^"|^'|"$|'$/g, '');
          process.env[key] = value;
        }
      }
    });
  } catch (e) {
    console.error('Error reading .env file:', e.message);
  }
}

const CONFIG_FILE = path.join(__dirname, 'config.json');

// Default paths for the two projects
let PROJECTS = {
  PROJECT_A: process.env.PROJECT_A_PATH || '',
  PROJECT_B: process.env.PROJECT_B_PATH || ''
};

// Load saved configuration if it exists
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (saved.PROJECT_A && saved.PROJECT_B) {
      PROJECTS = saved;
      console.log('Loaded project paths from config.json:', PROJECTS);
    } else if (saved.ADHA && saved.CCISTTA) {
      // Migrate legacy config keys
      PROJECTS = {
        PROJECT_A: saved.ADHA,
        PROJECT_B: saved.CCISTTA
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(PROJECTS, null, 2), 'utf8');
      console.log('Migrated legacy project paths from config.json and saved:', PROJECTS);
    }
  } catch (e) {
    console.error('Error loading config.json, using defaults:', e.message);
  }
}

// Helper to get folder name from path
function getProjectName(dirPath) {
  try {
    return path.basename(path.resolve(dirPath)) || 'Project';
  } catch (e) {
    return 'Project';
  }
}

// Helper to check if a directory is a Git repo
function isGitRepo(dirPath) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: dirPath, stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// Parse git status porcelain format
function parseGitStatus(output) {
  if (!output.trim()) return [];
  return output.split('\n').filter(line => line.trim()).map(line => {
    // Format is "XY PATH" or "XY \"PATH\""
    const statusPart = line.substring(0, 2);
    let filePath = line.substring(3).trim();
    
    // Remove quotes if present
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = filePath.substring(1, filePath.length - 1);
    }
    
    // Decode octal escape sequences if Git escaped them (common for non-ASCII)
    filePath = filePath.replace(/\\(\d{3})/g, (match, octal) => {
      return String.fromCharCode(parseInt(octal, 8));
    });

    const indexStatus = statusPart[0];
    const workTreeStatus = statusPart[1];

    let statusText = 'Modified';
    let statusCode = 'M';
    
    if (indexStatus === 'A' || workTreeStatus === 'A') {
      statusText = 'Added';
      statusCode = 'A';
    } else if (indexStatus === 'D' || workTreeStatus === 'D') {
      statusText = 'Deleted';
      statusCode = 'D';
    } else if (indexStatus === '?' || workTreeStatus === '?') {
      statusText = 'Untracked';
      statusCode = '??';
    } else if (indexStatus === 'R' || workTreeStatus === 'R') {
      statusText = 'Renamed';
      statusCode = 'R';
    }

    return {
      path: filePath,
      status: statusText,
      code: statusCode,
      rawStatus: statusPart
    };
  });
}

// GET status of both projects
app.get('/api/status', (req, res) => {
  const result = {};
  console.log(`[API] Checking git status for projects...`);

  for (const [key, dirPath] of Object.entries(PROJECTS)) {
    const projName = getProjectName(dirPath);
    if (!fs.existsSync(dirPath)) {
      result[key] = {
        name: projName,
        path: dirPath,
        exists: false,
        error: 'Directory does not exist',
        changes: []
      };
      continue;
    }

    const isGit = isGitRepo(dirPath);
    if (!isGit) {
      result[key] = {
        name: projName,
        path: dirPath,
        exists: true,
        isGit: false,
        error: 'Not a git repository',
        changes: []
      };
      continue;
    }

    try {
      // -u flag shows untracked files individually
      const statusOutput = execSync('git status --porcelain -u', { cwd: dirPath, encoding: 'utf8' });
      const changes = parseGitStatus(statusOutput);
      result[key] = {
        name: projName,
        path: dirPath,
        exists: true,
        isGit: true,
        changes: changes
      };
    } catch (error) {
      result[key] = {
        name: projName,
        path: dirPath,
        exists: true,
        isGit: true,
        error: `Failed to run git status: ${error.message}`,
        changes: []
      };
    }
  }

  // Post-process changes to flag files that are identical between PROJECT_A and PROJECT_B
  if (result.PROJECT_A && result.PROJECT_B && result.PROJECT_A.changes && result.PROJECT_B.changes) {
    const checkIdentical = (change, sourceKey, destKey) => {
      const sourceFile = path.join(PROJECTS[sourceKey], change.path);
      const destFile = path.join(PROJECTS[destKey], change.path);

      if (fs.existsSync(sourceFile) && fs.existsSync(destFile)) {
        try {
          const sourceBuf = fs.readFileSync(sourceFile);
          const destBuf = fs.readFileSync(destFile);
          change.isIdentical = sourceBuf.equals(destBuf);
        } catch (e) {
          change.isIdentical = false;
        }
      } else {
        change.isIdentical = false;
      }
    };

    result.PROJECT_A.changes.forEach(change => checkIdentical(change, 'PROJECT_A', 'PROJECT_B'));
    result.PROJECT_B.changes.forEach(change => checkIdentical(change, 'PROJECT_B', 'PROJECT_A'));
  }

  res.json(result);
});

// GET configuration paths
app.get('/api/config', (req, res) => {
  res.json(PROJECTS);
});

// POST save configuration paths
app.post('/api/config', (req, res) => {
  const { pathA, pathB } = req.body;
  console.log(`[API] Updating paths: A=${pathA}, B=${pathB}`);

  if (!pathA || !pathB) {
    return res.status(400).json({ error: 'Both project paths are required.' });
  }

  const resolvedA = path.resolve(pathA.trim());
  const resolvedB = path.resolve(pathB.trim());

  if (!fs.existsSync(resolvedA)) {
    return res.status(400).json({ error: `Path A does not exist: ${pathA}` });
  }
  if (!fs.existsSync(resolvedB)) {
    return res.status(400).json({ error: `Path B does not exist: ${pathB}` });
  }

  PROJECTS.PROJECT_A = resolvedA;
  PROJECTS.PROJECT_B = resolvedB;

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(PROJECTS, null, 2), 'utf8');
    fs.writeFileSync(ENV_FILE, `PORT=${PORT}\nPROJECT_A_PATH=${resolvedA}\nPROJECT_B_PATH=${resolvedB}\n`, 'utf8');
    
    if (liveSyncMode !== 'off') {
      try {
        startLiveSync(liveSyncMode);
      } catch (e) {
        liveSyncMode = 'off';
        console.error('Failed to restart Live Sync after config change:', e.message);
      }
    }

    res.json({
      success: true,
      message: 'Configuration saved successfully.',
      config: PROJECTS
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to save configuration: ${error.message}` });
  }
});

// GET browse directory contents for folder selector
app.get('/api/browse-dir', (req, res) => {
  let currentPath = req.query.path || process.env.HOME || '/';
  currentPath = path.resolve(currentPath);
  console.log(`[API] Browsing directory: ${currentPath}`);

  try {
    if (!fs.existsSync(currentPath)) {
      currentPath = process.env.HOME || '/';
    }

    const stats = fs.statSync(currentPath);
    if (!stats.isDirectory()) {
      currentPath = path.dirname(currentPath);
    }

    const items = fs.readdirSync(currentPath, { withFileTypes: true });
    
    // Filter directories only
    const directories = items
      .filter(item => {
        try {
          if (item.name.startsWith('.') && item.name !== '.git') return false;
          return item.isDirectory() || item.isSymbolicLink();
        } catch (e) {
          return false;
        }
      })
      .map(item => item.name)
      .sort((a, b) => a.localeCompare(b));

    const parent = path.dirname(currentPath);

    res.json({
      currentPath,
      parent: parent === currentPath ? null : parent,
      directories
    });
  } catch (error) {
    console.error(`[API] Browse directory error: ${error.message}`);
    res.status(500).json({ error: `Failed to read directory: ${error.message}` });
  }
});

// GET file diff or content
app.get('/api/diff', (req, res) => {
  const { file, compare, sourceProject } = req.query;
  console.log(`[API] Fetching diff for: ${file} (compare=${compare}, source=${sourceProject})`);

  if (!file) {
    return res.status(400).json({ error: 'File parameter is required' });
  }

  const projA = PROJECTS.PROJECT_A;
  const projB = PROJECTS.PROJECT_B;

  const fileA = path.join(projA, file);
  const fileB = path.join(projB, file);

  if (compare === 'true') {
    // Cross-project comparison
    const existsA = fs.existsSync(fileA);
    const existsB = fs.existsSync(fileB);

    if (!existsA && !existsB) {
      return res.status(404).json({ error: 'File does not exist in either project' });
    }

    const pathA = existsA ? fileA : '/dev/null';
    const pathB = existsB ? fileB : '/dev/null';

    try {
      // git diff --no-index returns exit code 1 if differences are found, which causes execSync to throw.
      // We capture stdout from the error object if it throws.
      const diff = execSync(`git diff --no-index --color=never "${pathA}" "${pathB}"`, { encoding: 'utf8' });
      res.json({ diff, type: 'cross-project' });
    } catch (error) {
      if (error.status === 1) {
        res.json({ diff: error.stdout, type: 'cross-project' });
      } else {
        res.status(500).json({ error: `Diff error: ${error.message}` });
      }
    }
  } else {
    // Local Git diff against HEAD
    const activeProject = sourceProject || 'PROJECT_A';
    const cwd = PROJECTS[activeProject];

    if (!cwd) {
      return res.status(400).json({ error: 'Invalid source project' });
    }

    const filePath = path.join(cwd, file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File does not exist in project ${activeProject}` });
    }

    try {
      let diff = execSync(`git diff --color=never "${file}"`, { cwd, encoding: 'utf8' });
      
      // If diff is empty, it could be an untracked file. Let's return the content of the file.
      if (!diff.trim()) {
        const isUntracked = execSync(`git status --porcelain "${file}"`, { cwd, encoding: 'utf8' }).includes('??');
        if (isUntracked) {
          const content = fs.readFileSync(filePath, 'utf8');
          // Format as a mock diff (all lines added)
          diff = `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${content.split('\n').length} @@\n` + 
                 content.split('\n').map(line => '+' + line).join('\n');
        } else {
          diff = 'No local changes (file is staged or identical to HEAD)';
        }
      }

      res.json({ diff, type: 'local' });
    } catch (error) {
      res.status(500).json({ error: `Git diff error: ${error.message}` });
    }
  }
});

// Helper to deep-merge JSON objects, only adding keys missing in the target
function mergeJsonObjects(source, target) {
  const merged = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (key in merged) {
      if (typeof value === 'object' && value !== null && typeof merged[key] === 'object' && merged[key] !== null) {
        merged[key] = mergeJsonObjects(value, merged[key]);
      }
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

// Helper to perform a 3-way merge on text files using git merge-file
function performGitMergeFile(sourceFile, destFile, file, from, to, res) {
  const tempBaseFile = path.join(os.tmpdir(), `base-${Date.now()}-${path.basename(file)}`);
  try {
    fs.writeFileSync(tempBaseFile, '', 'utf8'); // Empty base file for 3-way merge
    
    // git merge-file <current-file> <base-file> <other-file>
    execSync(`git merge-file "${destFile}" "${tempBaseFile}" "${sourceFile}"`);
    
    console.log(`[API] SUCCESS: Merged ${file} from ${from} to ${to} (No conflicts)`);
    return res.json({
      success: true,
      message: `Successfully merged changes in ${file} from ${from} to ${to} (no conflicts).`
    });
  } catch (error) {
    // If exit code is non-zero, it means there are conflicts, but the file is still written with conflict markers!
    console.log(`[API] SUCCESS: Merged ${file} from ${from} to ${to} with conflicts`);
    return res.json({
      success: true,
      message: `Merged changes in ${file} from ${from} to ${to} with conflicts. Please check file for conflict markers.`
    });
  } finally {
    if (fs.existsSync(tempBaseFile)) {
      fs.unlinkSync(tempBaseFile);
    }
  }
}

// POST sync/copy file from source to target
app.post('/api/sync', (req, res) => {
  const { file, from, to, mergeJson } = req.body;
  console.log(`[API] Syncing file: ${file} from ${from} to ${to}... (mergeJson=${!!mergeJson})`);

  if (!file || !from || !to) {
    return res.status(400).json({ error: 'Missing required parameters: file, from, to' });
  }

  const sourceDir = PROJECTS[from];
  const destDir = PROJECTS[to];

  if (!sourceDir || !destDir) {
    return res.status(400).json({ error: 'Invalid source or destination project' });
  }

  const sourceFile = path.join(sourceDir, file);
  const destFile = path.join(destDir, file);

  if (!fs.existsSync(sourceFile)) {
    return res.status(404).json({ error: `Source file does not exist: ${sourceFile}` });
  }

  try {
    // Create destination directories if they don't exist
    const destFolder = path.dirname(destFile);
    if (!fs.existsSync(destFolder)) {
      fs.mkdirSync(destFolder, { recursive: true });
    }

    // If mergeJson is true, perform smart merge
    if (mergeJson && fs.existsSync(destFile)) {
      if (isBinaryFile(file)) {
        // Fall back to copy for binary files
        fs.copyFileSync(sourceFile, destFile);
      } else if (file.endsWith('.json')) {
        try {
          const sourceData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
          const destData = JSON.parse(fs.readFileSync(destFile, 'utf8'));
          const mergedData = mergeJsonObjects(sourceData, destData);
          
          fs.writeFileSync(destFile, JSON.stringify(mergedData, null, 2), 'utf8');
          console.log(`[API] SUCCESS: Merged JSON keys in ${file} from ${from} to ${to}`);
          return res.json({
            success: true,
            message: `Successfully merged missing keys in ${file} from ${from} to ${to}.`
          });
        } catch (jsonErr) {
          console.error(`[API] JSON parse error in ${file}, falling back to git merge-file: ${jsonErr.message}`);
          return performGitMergeFile(sourceFile, destFile, file, from, to, res);
        }
      } else {
        return performGitMergeFile(sourceFile, destFile, file, from, to, res);
      }
    }

    // Copy file (replaces if exists)
    fs.copyFileSync(sourceFile, destFile);
    console.log(`[API] SUCCESS: Copied ${file} from ${from} to ${to}`);

    res.json({ 
      success: true, 
      message: `Successfully copied ${file} from ${from} to ${to}.` 
    });
  } catch (error) {
    console.error(`[API] ERROR copying file: ${error.message}`);
    res.status(500).json({ error: `Failed to copy file: ${error.message}` });
  }
});

// POST sync/copy ALL or SELECTED changed files from source to target
app.post('/api/sync-all', (req, res) => {
  const { from, to, mergeJson, files } = req.body;
  console.log(`[API] Bulk sync requested: from ${from} to ${to}... (mergeJson=${!!mergeJson}, selectedCount=${files ? files.length : 'all'})`);

  if (!from || !to) {
    return res.status(400).json({ error: 'Missing required parameters: from, to' });
  }

  const sourceDir = PROJECTS[from];
  const destDir = PROJECTS[to];

  if (!sourceDir || !destDir) {
    return res.status(400).json({ error: 'Invalid source or destination project' });
  }

  try {
    let filesToSync = [];
    if (files && Array.isArray(files)) {
      filesToSync = files;
    } else {
      // Fallback: Get all changed files if no array specified
      const statusOutput = execSync('git status --porcelain -u', { cwd: sourceDir, encoding: 'utf8' });
      const changes = parseGitStatus(statusOutput);
      filesToSync = changes.map(c => c.path);
    }

    if (filesToSync.length === 0) {
      return res.json({ success: true, message: `No files to sync.` });
    }

    const syncedFiles = [];
    const failedFiles = [];

    // 2. Copy each file
    for (const file of filesToSync) {
      const sourceFile = path.join(sourceDir, file);
      const destFile = path.join(destDir, file);

      try {
        const destFolder = path.dirname(destFile);
        if (!fs.existsSync(destFolder)) {
          fs.mkdirSync(destFolder, { recursive: true });
        }

        // If mergeJson is enabled, perform smart merge
        if (mergeJson && fs.existsSync(destFile)) {
          if (isBinaryFile(file)) {
            fs.copyFileSync(sourceFile, destFile);
            syncedFiles.push(file);
            continue;
          } else if (file.endsWith('.json')) {
            try {
              const sourceData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
              const destData = JSON.parse(fs.readFileSync(destFile, 'utf8'));
              const mergedData = mergeJsonObjects(sourceData, destData);
              fs.writeFileSync(destFile, JSON.stringify(mergedData, null, 2), 'utf8');
              syncedFiles.push(`${file} (merged JSON)`);
              continue;
            } catch (jsonErr) {
              console.error(`[API] JSON merge failed in bulk sync for ${file}, trying git merge: ${jsonErr.message}`);
            }
          }

          // Perform git merge-file for text files
          const tempBaseFile = path.join(os.tmpdir(), `base-${Date.now()}-${path.basename(file)}`);
          try {
            fs.writeFileSync(tempBaseFile, '', 'utf8');
            execSync(`git merge-file "${destFile}" "${tempBaseFile}" "${sourceFile}"`);
            syncedFiles.push(`${file} (merged changes)`);
            continue;
          } catch (mergeErr) {
            // Non-zero exit code means conflicts exist, but file contains conflict markers
            syncedFiles.push(`${file} (merged with conflicts)`);
            continue;
          } finally {
            if (fs.existsSync(tempBaseFile)) {
              fs.unlinkSync(tempBaseFile);
            }
          }
        }

        fs.copyFileSync(sourceFile, destFile);
        syncedFiles.push(file);
      } catch (err) {
        console.error(`[API] Failed to copy ${file}: ${err.message}`);
        failedFiles.push({ file, error: err.message });
      }
    }

    console.log(`[API] SUCCESS: Bulk sync completed. Synced ${syncedFiles.length} files. Failed ${failedFiles.length} files.`);

    res.json({
      success: true,
      message: `Successfully synchronized ${syncedFiles.length} files from ${from} to ${to}.`,
      synced: syncedFiles,
      failed: failedFiles
    });
  } catch (error) {
    console.error(`[API] Bulk sync error: ${error.message}`);
    res.status(500).json({ error: `Failed to perform bulk sync: ${error.message}` });
  }
});

// POST discard local changes in bulk for selected files
app.post('/api/discard-all', (req, res) => {
  const { project, files } = req.body;

  if (!project || !files || !Array.isArray(files)) {
    return res.status(400).json({ error: 'Missing or invalid parameters: project, files' });
  }

  const cwd = PROJECTS[project];
  if (!cwd) {
    return res.status(400).json({ error: 'Invalid project' });
  }

  try {
    const discarded = [];
    const failed = [];

    for (const file of files) {
      try {
        const status = execSync(`git status --porcelain "${file}"`, { cwd, encoding: 'utf8' }).trim();
        
        if (status.startsWith('??')) {
          const filePath = path.join(cwd, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } else {
          execSync(`git checkout HEAD -- "${file}"`, { cwd, stdio: 'ignore' });
          execSync(`git clean -fd -- "${file}"`, { cwd, stdio: 'ignore' });
        }
        discarded.push(file);
      } catch (err) {
        console.error(`[API] Discard failed for ${file}: ${err.message}`);
        failed.push({ file, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Successfully discarded changes in ${discarded.length} files in ${project}.`,
      discarded,
      failed
    });
  } catch (error) {
    console.error(`[API] Bulk discard error: ${error.message}`);
    res.status(500).json({ error: `Failed to perform bulk discard: ${error.message}` });
  }
});

// POST discard local changes in a project (using git checkout/clean)
app.post('/api/discard', (req, res) => {
  const { file, project } = req.body;

  if (!file || !project) {
    return res.status(400).json({ error: 'Missing required parameters: file, project' });
  }

  const cwd = PROJECTS[project];
  if (!cwd) {
    return res.status(400).json({ error: 'Invalid project' });
  }

  try {
    // Check status first to see if it's untracked or modified
    const status = execSync(`git status --porcelain "${file}"`, { cwd, encoding: 'utf8' }).trim();
    
    if (status.startsWith('??')) {
      // Untracked file -> delete it
      const filePath = path.join(cwd, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } else {
      // Modified or index added -> checkout/clean
      execSync(`git checkout HEAD -- "${file}"`, { cwd, stdio: 'ignore' });
      execSync(`git clean -fd -- "${file}"`, { cwd, stdio: 'ignore' });
    }

    res.json({ success: true, message: `Discarded changes in ${file} for project ${project}` });
  } catch (error) {
    res.status(500).json({ error: `Failed to discard changes: ${error.message}` });
  }
});

// GET list of commits for a project
app.get('/api/commits', (req, res) => {
  const { project } = req.query;
  const cwd = PROJECTS[project];
  
  if (!cwd || !fs.existsSync(cwd)) {
    return res.status(400).json({ error: 'Invalid project path or path does not exist' });
  }
  
  try {
    const logOutput = execSync('git log -n 25 --pretty=format:"%H|%an|%ad|%s" --date=short', { cwd, encoding: 'utf8' });
    if (!logOutput.trim()) {
      return res.json([]);
    }
    const commits = logOutput.trim().split('\n').map(line => {
      const [hash, author, date, ...messageParts] = line.split('|');
      const message = messageParts.join('|');
      return { hash, author, date, message };
    });
    res.json(commits);
  } catch (error) {
    res.status(500).json({ error: `Failed to fetch commits: ${error.message}` });
  }
});

// GET list of files changed in a commit
app.get('/api/commit-files', (req, res) => {
  const { project, hash } = req.query;
  const cwd = PROJECTS[project];
  
  if (!cwd || !fs.existsSync(cwd)) {
    return res.status(400).json({ error: 'Invalid project path or path does not exist' });
  }
  if (!hash) {
    return res.status(400).json({ error: 'Commit hash is required' });
  }
  
  try {
    const filesOutput = execSync(`git diff-tree --no-commit-id --name-status -r ${hash}`, { cwd, encoding: 'utf8' });
    if (!filesOutput.trim()) {
      return res.json([]);
    }
    const files = filesOutput.trim().split('\n').map(line => {
      const parts = line.split(/\s+/);
      const code = parts[0];
      const filePath = parts.slice(1).join(' ');
      
      let isIdentical = false;
      const destProject = project === 'PROJECT_A' ? 'PROJECT_B' : 'PROJECT_A';
      const destCwd = PROJECTS[destProject];
      
      if (destCwd && fs.existsSync(destCwd)) {
        const destFilePath = path.join(destCwd, filePath);
        if (code === 'D') {
          // Deleted in commit: identical if it also does not exist in destination
          isIdentical = !fs.existsSync(destFilePath);
        } else if (fs.existsSync(destFilePath)) {
          try {
            const commitContent = execSync(`git show ${hash}:"${filePath}"`, { cwd, maxBuffer: 10 * 1024 * 1024 });
            const destContent = fs.readFileSync(destFilePath);
            if (commitContent.equals(destContent)) {
              isIdentical = true;
            }
          } catch (e) {
            // fallback / ignore errors
          }
        }
      }
      
      return { code, path: filePath, isIdentical };
    });
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: `Failed to fetch commit files: ${error.message}` });
  }
});

// GET diff for a specific file in a commit
app.get('/api/commit-diff', (req, res) => {
  const { project, hash, file } = req.query;
  const cwd = PROJECTS[project];
  
  if (!cwd || !fs.existsSync(cwd)) {
    return res.status(400).json({ error: 'Invalid project path or path does not exist' });
  }
  if (!hash || !file) {
    return res.status(400).json({ error: 'Hash and file parameters are required' });
  }
  
  try {
    const diff = execSync(`git show --color=never ${hash} -- "${file}"`, { cwd, encoding: 'utf8' });
    res.json({ diff });
  } catch (error) {
    res.status(500).json({ error: `Failed to get commit file diff: ${error.message}` });
  }
});

// GET full project scan comparison (not git status-bound, respects .gitignore)
app.get('/api/scan-compare', (req, res) => {
  const pathA = PROJECTS.PROJECT_A;
  const pathB = PROJECTS.PROJECT_B;

  if (!pathA || !fs.existsSync(pathA) || !pathB || !fs.existsSync(pathB)) {
    return res.status(400).json({ error: 'Both project paths must be configured and exist.' });
  }

  try {
    const crypto = require('crypto');
    
    // Fetch index list with hashes
    let outputA = '';
    try {
      outputA = execSync('git ls-files -s', { cwd: pathA, encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });
    } catch (err) {
      console.error('Error run git ls-files -s A:', err);
    }

    let outputB = '';
    try {
      outputB = execSync('git ls-files -s', { cwd: pathB, encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });
    } catch (err) {
      console.error('Error run git ls-files -s B:', err);
    }

    const parseIndex = (output) => {
      const map = new Map();
      const lines = output.split('\n');
      lines.forEach(line => {
        if (!line) return;
        const parts = line.split(/\s+/);
        if (parts.length < 4) return;
        const hash = parts[1];
        const relPath = parts.slice(3).join(' ');
        map.set(relPath, hash);
      });
      return map;
    };

    const mapA = parseIndex(outputA);
    const mapB = parseIndex(outputB);

    // Fetch untracked files
    let untrackedA = new Set();
    try {
      const outUntrackedA = execSync('git ls-files -o --exclude-standard', { cwd: pathA, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      untrackedA = new Set(outUntrackedA.split('\n').map(f => f.trim()).filter(Boolean));
    } catch (err) {}

    let untrackedB = new Set();
    try {
      const outUntrackedB = execSync('git ls-files -o --exclude-standard', { cwd: pathB, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      untrackedB = new Set(outUntrackedB.split('\n').map(f => f.trim()).filter(Boolean));
    } catch (err) {}

    const allFiles = new Set([...mapA.keys(), ...mapB.keys(), ...untrackedA, ...untrackedB]);
    const differences = [];

    allFiles.forEach(file => {
      const inIndexA = mapA.has(file);
      const inIndexB = mapB.has(file);
      const isUntrackedA = untrackedA.has(file);
      const isUntrackedB = untrackedB.has(file);

      const existsA = inIndexA || isUntrackedA;
      const existsB = inIndexB || isUntrackedB;

      const fullPathA = path.join(pathA, file);
      const fullPathB = path.join(pathB, file);

      if (existsA && !existsB) {
        const sizeA = fs.existsSync(fullPathA) ? fs.statSync(fullPathA).size : null;
        differences.push({
          path: file,
          status: 'only_in_a',
          sizeA,
          sizeB: null
        });
      } else if (!existsA && existsB) {
        const sizeB = fs.existsSync(fullPathB) ? fs.statSync(fullPathB).size : null;
        differences.push({
          path: file,
          status: 'only_in_b',
          sizeA: null,
          sizeB
        });
      } else {
        // Exists in both, check if different
        let different = false;
        if (inIndexA && inIndexB) {
          different = mapA.get(file) !== mapB.get(file);
        } else {
          // One or both are untracked
          const sizeA = fs.existsSync(fullPathA) ? fs.statSync(fullPathA).size : null;
          const sizeB = fs.existsSync(fullPathB) ? fs.statSync(fullPathB).size : null;
          if (sizeA !== sizeB) {
            different = true;
          } else {
            const contentA = fs.existsSync(fullPathA) ? fs.readFileSync(fullPathA) : '';
            const contentB = fs.existsSync(fullPathB) ? fs.readFileSync(fullPathB) : '';
            different = !contentA.equals(contentB);
          }
        }

        if (different) {
          const sizeA = fs.existsSync(fullPathA) ? fs.statSync(fullPathA).size : null;
          const sizeB = fs.existsSync(fullPathB) ? fs.statSync(fullPathB).size : null;
          differences.push({
            path: file,
            status: 'modified',
            sizeA,
            sizeB
          });
        }
      }
    });

    res.json(differences);
  } catch (error) {
    res.status(500).json({ error: `Scanner failed: ${error.message}` });
  }
});

app.get('/api/git-branches', (req, res) => {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read config.json' });
  }

  const getProjectBranches = (projPath) => {
    if (!projPath || !fs.existsSync(projPath) || !fs.existsSync(path.join(projPath, '.git'))) {
      return { current: '', branches: [] };
    }
    try {
      const current = execSync('git branch --show-current', { cwd: projPath, encoding: 'utf8' }).trim();
      const branchesOut = execSync('git branch --format="%(refname:short)"', { cwd: projPath, encoding: 'utf8' });
      const branches = branchesOut.split('\n').map(b => b.trim()).filter(Boolean);
      // Ensure current is in the list
      if (current && !branches.includes(current)) {
        branches.push(current);
      }
      return { current, branches };
    } catch (err) {
      return { current: '', branches: [] };
    }
  };

  res.json({
    PROJECT_A: getProjectBranches(config.PROJECT_A),
    PROJECT_B: getProjectBranches(config.PROJECT_B)
  });
});

app.post('/api/git-checkout', (req, res) => {
  const { project, branch } = req.body;
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read config.json' });
  }

  const projPath = config[project];
  if (!projPath || !fs.existsSync(projPath)) {
    return res.status(400).json({ error: 'Invalid project path' });
  }

  try {
    execSync(`git checkout ${branch}`, { cwd: projPath });
    res.json({ success: true, message: `Switched ${project} to branch ${branch}` });
  } catch (error) {
    res.status(500).json({ error: `Checkout failed: ${error.message}` });
  }
});

// ================= Live Sync Mode =================
const chokidar = require('chokidar');

let liveSyncMode = 'off'; // 'off', 'a-to-b', 'b-to-a'
let liveSyncWatcher = null;
const liveSyncClients = new Set();

function stopLiveSync() {
  if (liveSyncWatcher) {
    liveSyncWatcher.close();
    liveSyncWatcher = null;
  }
}

function sendLiveSyncEvent(event, data) {
  const message = `data: ${JSON.stringify({ event, data })}\n\n`;
  liveSyncClients.forEach(client => {
    try {
      client.write(message);
    } catch (e) {
      liveSyncClients.delete(client);
    }
  });
}

function isGitIgnored(repoPath, relativePath) {
  try {
    execSync(`git check-ignore "${relativePath}"`, { cwd: repoPath, stdio: 'ignore' });
    return true; // exit code 0 means ignored
  } catch (err) {
    return false; // non-zero exit code means not ignored
  }
}

function startLiveSync(mode) {
  stopLiveSync();
  
  liveSyncMode = mode;
  if (mode === 'off') {
    sendLiveSyncEvent('status', { mode: 'off' });
    console.log('[Live Sync] Stopped');
    return;
  }

  const sourceProj = mode === 'a-to-b' ? 'PROJECT_A' : 'PROJECT_B';
  const destProj = mode === 'a-to-b' ? 'PROJECT_B' : 'PROJECT_A';
  
  const sourcePath = PROJECTS[sourceProj];
  const destPath = PROJECTS[destProj];

  if (!sourcePath || !fs.existsSync(sourcePath) || !destPath || !fs.existsSync(destPath)) {
    throw new Error('Project paths are not configured or do not exist.');
  }

  // Watch the source path
  liveSyncWatcher = chokidar.watch(sourcePath, {
    ignored: [
      '**/.git/**',
      '**/node_modules/**',
      '**/vendor/**',
      '**/storage/**'
    ],
    persistent: true,
    ignoreInitial: true, // only watch future changes
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 50
    }
  });

  liveSyncWatcher.on('all', (event, filePath) => {
    const relativePath = path.relative(sourcePath, filePath);
    
    // Check if ignored by git
    if (isGitIgnored(sourcePath, relativePath)) {
      return;
    }

    const targetPath = path.join(destPath, relativePath);

    if (event === 'add' || event === 'change') {
      try {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(filePath, targetPath);
        console.log(`[Live Sync] Copied: ${relativePath}`);
        sendLiveSyncEvent('sync', {
          action: 'copy',
          file: relativePath,
          source: getProjectName(sourcePath),
          dest: getProjectName(destPath)
        });
      } catch (err) {
        console.error(`[Live Sync] Error copying ${relativePath}:`, err);
        sendLiveSyncEvent('error', {
          file: relativePath,
          error: err.message
        });
      }
    } else if (event === 'unlink') {
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
          console.log(`[Live Sync] Deleted: ${relativePath}`);
          sendLiveSyncEvent('sync', {
            action: 'delete',
            file: relativePath,
            source: getProjectName(sourcePath),
            dest: getProjectName(destPath)
          });
        }
      } catch (err) {
        console.error(`[Live Sync] Error deleting ${relativePath}:`, err);
        sendLiveSyncEvent('error', {
          file: relativePath,
          error: err.message
        });
      }
    }
  });

  sendLiveSyncEvent('status', { mode });
  console.log(`[Live Sync] Started watching: ${sourcePath} ➔ ${destPath}`);
}

app.get('/api/live-sync-events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  liveSyncClients.add(res);

  // Send initial state on connection
  res.write(`data: ${JSON.stringify({ event: 'init', data: { mode: liveSyncMode } })}\n\n`);

  req.on('close', () => {
    liveSyncClients.delete(res);
  });
});

app.get('/api/live-sync-status', (req, res) => {
  res.json({ mode: liveSyncMode });
});

app.post('/api/live-sync', (req, res) => {
  const { mode } = req.body;
  if (!['off', 'a-to-b', 'b-to-a'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid live sync mode' });
  }

  try {
    startLiveSync(mode);
    res.json({ success: true, mode: liveSyncMode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
