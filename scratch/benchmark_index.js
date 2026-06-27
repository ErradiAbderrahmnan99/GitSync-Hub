const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load saved configuration dynamically
const configPath = path.join(__dirname, '..', 'config.json');
let pathA = '';
let pathB = '';
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  pathA = config.PROJECT_A || config.ADHA || '';
  pathB = config.PROJECT_B || config.CCISTTA || '';
}

if (!pathA || !pathB) {
  console.error('Error: Project paths are not configured in config.json!');
  process.exit(1);
}

console.time('git ls-files -s A');
const outputA = execSync('git ls-files -s', { cwd: pathA, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
console.timeEnd('git ls-files -s A');

console.time('git ls-files -s B');
const outputB = execSync('git ls-files -s', { cwd: pathB, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
console.timeEnd('git ls-files -s B');

console.time('parsing and comparison');
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

// Get untracked files and convert to Sets for O(1) lookups
const untrackedA = new Set(execSync('git ls-files -o --exclude-standard', { cwd: pathA, encoding: 'utf8' })
  .split('\n').map(f => f.trim()).filter(Boolean));
const untrackedB = new Set(execSync('git ls-files -o --exclude-standard', { cwd: pathB, encoding: 'utf8' })
  .split('\n').map(f => f.trim()).filter(Boolean));

const allFiles = new Set([...mapA.keys(), ...mapB.keys(), ...untrackedA, ...untrackedB]);
const diffs = [];

allFiles.forEach(file => {
  const inIndexA = mapA.has(file);
  const inIndexB = mapB.has(file);
  const isUntrackedA = untrackedA.has(file);
  const isUntrackedB = untrackedB.has(file);

  const existsA = inIndexA || isUntrackedA;
  const existsB = inIndexB || isUntrackedB;

  if (existsA && !existsB) {
    diffs.push({ path: file, status: 'only_in_a' });
  } else if (!existsA && existsB) {
    diffs.push({ path: file, status: 'only_in_b' });
  } else {
    // Exists in both
    if (inIndexA && inIndexB) {
      const hashA = mapA.get(file);
      const hashB = mapB.get(file);
      if (hashA !== hashB) {
        diffs.push({ path: file, status: 'modified' });
      }
    } else {
      // One or both are untracked
      const fullPathA = path.join(pathA, file);
      const fullPathB = path.join(pathB, file);
      const sizeA = fs.existsSync(fullPathA) ? fs.statSync(fullPathA).size : null;
      const sizeB = fs.existsSync(fullPathB) ? fs.statSync(fullPathB).size : null;
      if (sizeA !== sizeB) {
        diffs.push({ path: file, status: 'modified' });
      } else {
        // Compare contents if size matches
        const contentA = fs.existsSync(fullPathA) ? fs.readFileSync(fullPathA, 'utf8') : '';
        const contentB = fs.existsSync(fullPathB) ? fs.readFileSync(fullPathB, 'utf8') : '';
        if (contentA !== contentB) {
          diffs.push({ path: file, status: 'modified' });
        }
      }
    }
  }
});

console.timeEnd('parsing and comparison');
console.log('Total files checked:', allFiles.size);
console.log('Differences found:', diffs.length);
