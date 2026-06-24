const fs = require('fs');
const path = require('path');

function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[0o]/g, 'o')
    .replace(/[1li!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b')
    .replace(/[\W_]+/g, '');
}

const RESERVED = ['api', 'app', 'admin', 'dashboard', 'panel', 'status', 'docs', 'help', 'support', 'blog', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'cdn', 'assets', 'static', 'auth', 'login', 'register', 'signup', 'billing', 'payment', 'payments', 'checkout', 'store', 'shop', 'portal', 'www'];

const BRANDS = ['bca', 'bri', 'bni', 'mandiri', 'bsi', 'danamon', 'permata', 'cimb', 'jago', 'seabank', 'neobank', 'blu', 'gopay', 'ovo', 'dana', 'shopeepay', 'linkaja', 'paypal', 'xendit', 'midtrans', 'google', 'facebook', 'instagram', 'whatsapp', 'telegram', 'tiktok', 'apple', 'microsoft', 'netflix', 'steam', 'garena', 'moonton', 'pubg', 'freefire', 'mlbb', 'roblox', 'tokopedia', 'shopee', 'bukalapak', 'lazada', 'blibli', 'olx', 'carousell'];

const SECURITY_PHISHING = ['verify', 'verification', 'authenticator', 'security', 'update', 'urgent', 'identity', 'recover', 'reset', 'otp', 'password', 'sandi', 'pin', 'hack', 'cracked', 'leak', 'doxx', 'dump', 'carding', 'cvv'];

const SCAM_GAMBLING = ['slot', 'gacor', 'judi', 'poker', 'casino', 'kasino', 'togel', 'bet', 'betting', 'win', 'zeus', 'pragmatic', 'maxwin', 'rtp', 'depo', 'withdraw', 'toto', 'macau', 'sbobet', 'parlay', 'roulette', 'baccarat', 'spin', 'jackpot', 'scatter', 'mahjong', 'pgsoft', 'olympus', 'bonanza', 'taruhan', 'bandar', 'domino', 'qq', 'pola', 'free', 'gratis', 'claim', 'hadiah', 'undian', 'menang', 'bonus', 'airdrop', 'crypto', 'kripto', 'bitcoin', 'eth', 'usdt', 'binance', 'indodax', 'tokocrypto', 'wallet', 'metamask'];

module.exports = async ({github, context}) => {
  const prNumber = context.payload.pull_request.number;
  const author = context.payload.pull_request.user.login;
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  // Get changed files
  const { data: files } = await github.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  });

  const domainFiles = files.filter(f => f.filename.startsWith('domains/') && f.filename.endsWith('.json'));

  if (domainFiles.length === 0) return;

  if (domainFiles.length > 1) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Dilarang mendaftarkan lebih dari 1 domain dalam satu Pull Request.`);
    return;
  }

  const file = domainFiles[0];
  
  if (file.status === 'removed') {
    await approveAndMerge(github, owner, repo, prNumber, `@${author} 🗑️ Domain berhasil dihapus.`);
    return;
  }

  let domainData;
  try {
    const rawData = fs.readFileSync(file.filename, 'utf8');
    domainData = JSON.parse(rawData);
  } catch (e) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Format JSON tidak valid.`);
    return;
  }

  if (!domainData.domain || !domainData.record || !domainData.owner) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ JSON tidak lengkap. Harus memiliki 'domain', 'owner', dan 'record'.`);
    return;
  }

  if (domainData.owner.toLowerCase() !== author.toLowerCase()) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Field 'owner' harus sesuai dengan username GitHub kamu (${author}).`);
    return;
  }

  const expectedFilename = `domains/${domainData.domain.toLowerCase()}.json`;
  if (file.filename.toLowerCase() !== expectedFilename) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Nama file harus sesuai dengan nama domain (${expectedFilename}).`);
    return;
  }

  // --- BEGIN RISK SCORING ---
  const rawSubdomain = domainData.domain.toLowerCase();
  const normalizedSubdomain = normalize(rawSubdomain);
  const prAuthor = author.toLowerCase();
  
  let riskScore = 0;
  let flags = [];

  if (rawSubdomain.length < 3) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Nama subdomain minimal 3 karakter.`);
    return;
  }
  if (!/^[a-z0-9-]+$/.test(rawSubdomain)) {
    await closePR(github, owner, repo, prNumber, `@${author} ❌ Nama subdomain hanya boleh berisi huruf kecil, angka, dan tanda strip (-).`);
    return;
  }

  // 1. Reserved Words
  if (RESERVED.includes(rawSubdomain) || RESERVED.includes(normalizedSubdomain)) {
     riskScore += 100;
     flags.push("Reserved word");
  }

  // 2. Contains Brand
  for (const brand of BRANDS) {
    if (normalizedSubdomain.includes(brand)) {
       if (brand.length <= 3) {
         if (normalizedSubdomain === brand || rawSubdomain.includes(`-${brand}`) || rawSubdomain.includes(`${brand}-`)) {
            riskScore += 60;
            flags.push(`Brand impersonation (${brand})`);
         }
       } else {
         riskScore += 60;
         flags.push(`Brand impersonation (${brand})`);
       }
    }
  }

  // 3. Phishing/Security
  for (const word of SECURITY_PHISHING) {
    if (normalizedSubdomain.includes(word)) {
      riskScore += 40;
      flags.push(`Phishing keyword (${word})`);
    }
  }

  // 4. Scam/Gambling
  for (const word of SCAM_GAMBLING) {
    if (normalizedSubdomain.includes(word)) {
      riskScore += 50;
      flags.push(`Scam/Gambling keyword (${word})`);
    }
  }

  // 5. Profanity (from blacklist.json)
  let blacklist = [];
  try {
     blacklist = JSON.parse(fs.readFileSync('blacklist.json', 'utf8'));
  } catch(e) {}
  
  if (blacklist.includes(prAuthor)) {
     riskScore += 100;
     flags.push(`User is blacklisted`);
  }

  for (const badword of blacklist) {
     if (normalizedSubdomain.includes(badword) && badword.length > 3) {
        riskScore += 100;
        flags.push(`Profanity/Blacklist (${badword})`);
     } else if (normalizedSubdomain === badword || rawSubdomain === badword) {
        riskScore += 100;
        flags.push(`Profanity/Blacklist exact (${badword})`);
     }
  }

  // DECISION
  if (riskScore >= 80) {
     await closePR(github, owner, repo, prNumber, `@${author} ❌ Pendaftaran ditolak otomatis. \n**Alasan:** Terdeteksi indikasi abuse/pelanggaran (Skor: ${riskScore}).\n*Flags:* ${flags.join(', ')}`);
     return;
  } else if (riskScore >= 40) {
     await github.rest.issues.createComment({
        owner, repo, issue_number: prNumber,
        body: `@${author} ⚠️ **MANUAL REVIEW DIBUTUHKAN**\nSistem AI mendeteksi kata berisiko tinggi pada subdomain ini (Skor: ${riskScore}).\n*Flags:* ${flags.join(', ')}\n\nMenunggu review manual dari Admin.`
     });
     return; // Leave open, do not auto-merge
  }

  // --- END RISK SCORING ---

  // Enforce 3 Domains Per Account Limit
  let ownerCount = 0;
  const domainsDir = 'domains';
  if (fs.existsSync(domainsDir)) {
    const allFiles = fs.readdirSync(domainsDir);
    for (const f of allFiles) {
      if (f.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(domainsDir, f), 'utf8');
          const data = JSON.parse(content);
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

  await approveAndMerge(github, owner, repo, prNumber, `@${author} ✅ Validasi sukses! Subdomain **${rawSubdomain}.k0d.in** segera aktif dalam beberapa detik.`);
};

async function closePR(github, owner, repo, pull_number, body) {
  await github.rest.issues.createComment({ owner, repo, issue_number: pull_number, body });
  await github.rest.pulls.update({ owner, repo, pull_number, state: 'closed' });
}

async function approveAndMerge(github, owner, repo, pull_number, body) {
  await github.rest.issues.createComment({ owner, repo, issue_number: pull_number, body });
  try {
    await github.rest.pulls.merge({ owner, repo, pull_number, merge_method: 'squash' });
  } catch (e) {
    console.error("Failed to auto-merge: ", e);
  }
}
