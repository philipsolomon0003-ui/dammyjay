/**
 * Automated GitHub Pusher for ELITE VISION GLOBAL
 * Pushes all project source files directly to GitHub using the Git Data API.
 * Requires NO local git installation.
 * 
 * Usage:
 *   node push_to_github.js <YOUR_GITHUB_PERSONAL_ACCESS_TOKEN>
 * Or set the environment variable:
 *   $env:GITHUB_TOKEN="your_token_here"
 *   node push_to_github.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OWNER = process.env.GITHUB_OWNER || 'philipsolomon0003-ui';
const REPO = process.env.GITHUB_REPO || 'dammyjay';
const BRANCH = 'main';

const token = process.argv[2] || process.env.GITHUB_TOKEN;

if (!token) {
  console.log('============================================================');
  console.log(' ELITE VISION GLOBAL - Automated GitHub Deployment');
  console.log('============================================================');
  console.log('To push this project to https://github.com/' + OWNER + '/' + REPO + ':');
  console.log('');
  console.log('Run the command with your GitHub Personal Access Token:');
  console.log('  .\\run.cmd push_to_github.js <YOUR_GITHUB_TOKEN>');
  console.log('');
  console.log('How to generate a token (1 minute):');
  console.log('1. Go to https://github.com/settings/tokens');
  console.log('2. Click "Generate new token (classic)"');
  console.log('3. Name it "Elite Vision" and check the "repo" box');
  console.log('4. Click "Generate token" and copy it');
  console.log('============================================================');
  process.exit(1);
}

function githubRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: endpoint,
      method,
      headers: {
        'User-Agent': 'ELITE-VISION-GLOBAL-Pusher/1.0',
        'Authorization': `Bearer ${token.trim()}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        } : {})
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`GitHub API (${res.statusCode}): ${parsed.message || data}`));
          }
        } catch (e) {
          reject(new Error(`GitHub API Parse Error (${res.statusCode}): ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const ignoredDirs = new Set(['node_modules', '.git', 'data']);
const ignoredFiles = new Set(['.env', 'iptv_crm.sqlite']);

function getFilesToPush(dir = '.') {
  const files = [];
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative('.', fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          walk(fullPath);
        }
      } else {
        if (!ignoredFiles.has(entry.name) && !entry.name.endsWith('.log') && entry.name !== 'push_to_github.js') {
          files.push({
            path: relPath,
            content: fs.readFileSync(fullPath)
          });
        }
      }
    }
  }
  walk(dir);
  return files;
}

async function deploy() {
  console.log(`Starting deployment to https://github.com/${OWNER}/${REPO}...`);

  // 1. Verify access to repository
  console.log('1. Checking repository access...');
  const repoInfo = await githubRequest('GET', `/repos/${OWNER}/${REPO}`);
  console.log(`   Connected to ${repoInfo.full_name} (${repoInfo.private ? 'Private' : 'Public'})`);

  // 2. Collect files
  console.log('2. Scanning project files...');
  const files = getFilesToPush();
  console.log(`   Found ${files.length} source files to upload.`);

  // 3. Upload blobs
  console.log('3. Uploading file blobs to GitHub...');
  const treeItems = [];
  for (const f of files) {
    const isText = !/\.(png|jpg|jpeg|gif|ico|sqlite|tar|zip)$/i.test(f.path);
    const blobData = isText
      ? { content: f.content.toString('utf8'), encoding: 'utf-8' }
      : { content: f.content.toString('base64'), encoding: 'base64' };

    const blob = await githubRequest('POST', `/repos/${OWNER}/${REPO}/git/blobs`, blobData);
    treeItems.push({
      path: f.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha
    });
    console.log(`   ✓ ${f.path}`);
  }

  // 4. Create Tree
  console.log('4. Creating Git tree...');
  const tree = await githubRequest('POST', `/repos/${OWNER}/${REPO}/git/trees`, {
    tree: treeItems
  });
  console.log(`   Tree SHA: ${tree.sha}`);

  // 5. Create Commit
  console.log('5. Creating Git commit...');
  const commit = await githubRequest('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: 'Initial release: ELITE VISION GLOBAL - Personal Discord AI Business Assistant & CRM',
    tree: tree.sha,
    parents: []
  });
  console.log(`   Commit SHA: ${commit.sha}`);

  // 6. Update or Create Branch Ref
  console.log(`6. Setting branch '${BRANCH}'...`);
  try {
    // Attempt to update ref if branch exists
    await githubRequest('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
      sha: commit.sha,
      force: true
    });
  } catch (err) {
    // If branch doesn't exist, create it
    await githubRequest('POST', `/repos/${OWNER}/${REPO}/git/refs`, {
      ref: `refs/heads/${BRANCH}`,
      sha: commit.sha
    });
  }

  console.log('\n============================================================');
  console.log(' SUCCESS! All files pushed to GitHub:');
  console.log(` https://github.com/${OWNER}/${REPO}`);
  console.log('============================================================');
}

deploy().catch(err => {
  console.error('\nDeployment failed:', err.message);
  process.exit(1);
});
