const fs = require('fs');
const path = require('path');

module.exports = async ({github, context}) => {
  const prNumber = context.payload.pull_request.number;
  const author = context.payload.pull_request.user.login;
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  // Load blacklist
  let blacklist = [];
  try {
    const blacklistData = fs.readFileSync('blacklist.json', 'utf8');
    blacklist = JSON.parse(blacklistData);
  } catch(e) {
    console.log("No blacklist.json found or failed to parse. Proceeding without blacklist.");
  }

  // Get changed files
  const { data: files } = await github.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  });

  const domainFiles = files.filter(f => f.filename.startsWith('domains/') && f.filename.endsWith('.json'));

  if (domainFiles.length === 0) {
    return; // Nothing to do
  }

  if (domainFiles.length > 1) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Dilarang mendaftarkan lebih dari 1 domain dalam satu Pull Request.`);
    return;
  }

  const file = domainFiles[0];
  
  if (file.status === 'removed') {
    // Deleting a domain is fine, let's auto-merge
    await approveAndMerge(github, owner, repo, prNumber, `@${author} 🗑️ Domain berhasil dihapus.`);
    return;
  }

  // Read the modified JSON file
  let domainData;
  try {
    const rawData = fs.readFileSync(file.filename, 'utf8');
    domainData = JSON.parse(rawData);
  } catch (e) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Format JSON tidak valid.`);
    return;
  }

  // Validate JSON Structure
  if (!domainData.domain || !domainData.record || !domainData.owner) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ JSON tidak lengkap. Harus memiliki 'domain', 'owner', dan 'record'.`);
    return;
  }

  // Enforce Owner matches PR Author
  if (domainData.owner.toLowerCase() !== author.toLowerCase()) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Field 'owner' harus sesuai dengan username GitHub kamu (${author}).`);
    return;
  }

  // Enforce Filename matches Domain
  const expectedFilename = `domains/${domainData.domain.toLowerCase()}.json`;
  if (file.filename.toLowerCase() !== expectedFilename) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Nama file harus sesuai dengan nama domain (${expectedFilename}).`);
    return;
  }

  // Validate Domain Rules
  const subdomain = domainData.domain.toLowerCase();
  
  if (subdomain.length < 3) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Nama subdomain minimal 3 karakter.`);
    return;
  }

  if (!/^[a-z0-9-]+$/.test(subdomain)) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Nama subdomain hanya boleh berisi huruf kecil, angka, dan tanda strip (-).`);
    return;
  }

  if (blacklist.includes(subdomain)) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Subdomain '${subdomain}' tidak diizinkan (Masuk daftar Blacklist).`);
    return;
  }

  // Enforce 3 Domains Per Account Limit
  // Read all existing domains to count how many this owner has
  let ownerCount = 0;
  const domainsDir = 'domains';
  if (fs.existsSync(domainsDir)) {
    const allFiles = fs.readdirSync(domainsDir);
    for (const f of allFiles) {
      if (f.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(domainsDir, f), 'utf8');
          const data = JSON.parse(content);
          // If this is the file currently being edited, skip counting it as existing to avoid double count
          if (file.filename === `domains/${f}` && file.status !== 'added') continue; 
          
          if (data.owner && data.owner.toLowerCase() === author.toLowerCase()) {
            ownerCount++;
          }
        } catch(e) {}
      }
    }
  }

  if (file.status === 'added' && ownerCount >= 3) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Kamu sudah mencapai batas maksimal 3 subdomain per akun.`);
    return;
  }

  // If we reach here, it's valid!
  await approveAndMerge(github, owner, repo, prNumber, `@${author} ✅ Validasi sukses! Subdomain **${subdomain}.k0d.in** segera aktif dalam beberapa detik.`);
};

async function closePR(github, owner, repo, pull_number, body) {
  // Add comment
  await github.rest.issues.createComment({
    owner, repo, issue_number: pull_number, body
  });
  // Close PR
  await github.rest.pulls.update({
    owner, repo, pull_number, state: 'closed'
  });
}

async function approveAndMerge(github, owner, repo, pull_number, body) {
  // Add comment
  await github.rest.issues.createComment({
    owner, repo, issue_number: pull_number, body
  });
  
  // Merge PR
  try {
    await github.rest.pulls.merge({
      owner, repo, pull_number, merge_method: 'squash'
    });
  } catch (e) {
    console.error("Failed to auto-merge: ", e);
  }
}
