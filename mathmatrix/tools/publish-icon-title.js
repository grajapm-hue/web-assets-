/* Publish the home-screen identity to the live repo: manifest.json (title) and
   icon-512-maskable.png (size), as ONE commit.

   Raja: "can home screen app icon [be] a little bigger like beta without chrome
   badge and Title as [Kids Maths]".

   Same shape as promote-3-publish.js -- blobs, a tree on base_tree so every
   other file is untouched, one commit, move the branch. The difference is the
   icon: a PNG has to go up base64, not utf-8, or GitHub stores a corrupted blob
   that still looks like a successful publish. */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = 'KidsMathsMatrixPuzzle/kidsmathsmatrixpuzzle.github.io';
const gh = (args, input) => {
  const cmd = 'gh api ' + args + (input ? ` --input "${input}"` : '');
  return JSON.parse(execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
};
const tmp = f => path.join(__dirname, f);

const ref = gh(`repos/${REPO}/git/ref/heads/main`);
const headSha = ref.object.sha;
const headCommit = gh(`repos/${REPO}/git/commits/${headSha}`);
console.log('live HEAD  :', headSha.slice(0, 8), '-', headCommit.message.split('\n')[0].slice(0, 60));

function blob(localFile, binary){
  const body = binary
    ? { content: fs.readFileSync(localFile).toString('base64'), encoding: 'base64' }
    : { content: fs.readFileSync(localFile, 'utf8'), encoding: 'utf-8' };
  fs.writeFileSync(tmp('_blob.json'), JSON.stringify(body), 'utf8');
  const r = gh(`repos/${REPO}/git/blobs -X POST`, tmp('_blob.json'));
  fs.unlinkSync(tmp('_blob.json'));
  return r.sha;
}

const manifestSha = blob(tmp('_manifest-built.json'), false);
const iconSha = blob(path.join(__dirname, '..', 'icon-512-maskable.png'), true);
console.log('manifest   :', manifestSha.slice(0, 8));
console.log('icon       :', iconSha.slice(0, 8));

const treeBody = {
  base_tree: headCommit.tree.sha,
  tree: [
    { path: 'manifest.json',           mode: '100644', type: 'blob', sha: manifestSha },
    { path: 'icon-512-maskable.png',   mode: '100644', type: 'blob', sha: iconSha }
  ]
};
fs.writeFileSync(tmp('_tree.json'), JSON.stringify(treeBody), 'utf8');
const tree = gh(`repos/${REPO}/git/trees -X POST`, tmp('_tree.json'));
fs.unlinkSync(tmp('_tree.json'));
console.log('tree       :', tree.sha.slice(0, 8));

const msg = fs.readFileSync(tmp('_commit-message.txt'), 'utf8');
fs.writeFileSync(tmp('_commit.json'), JSON.stringify({
  message: msg, tree: tree.sha, parents: [headSha]
}), 'utf8');
const commit = gh(`repos/${REPO}/git/commits -X POST`, tmp('_commit.json'));
fs.unlinkSync(tmp('_commit.json'));
console.log('commit     :', commit.sha.slice(0, 8));

fs.writeFileSync(tmp('_ref.json'), JSON.stringify({ sha: commit.sha }), 'utf8');
const moved = gh(`repos/${REPO}/git/refs/heads/main -X PATCH`, tmp('_ref.json'));
fs.unlinkSync(tmp('_ref.json'));
console.log('main now   :', moved.object.sha.slice(0, 8));
console.log('\nrollback is ' + headSha.slice(0, 8));
