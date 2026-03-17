// scripts/backup.js
// Automated backup strategy: MongoDB dump + uploads archive
// Usage: node scripts/backup.js [--output-dir ./backups]

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/centralize_file_system';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const DEFAULT_BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Parse CLI args
const args = process.argv.slice(2);
let outputDir = DEFAULT_BACKUP_DIR;
const outputIdx = args.indexOf('--output-dir');
if (outputIdx !== -1 && args[outputIdx + 1]) {
  outputDir = path.resolve(args[outputIdx + 1]);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupSubDir = path.join(outputDir, `backup-${timestamp}`);

async function runBackup() {
  console.log(`🗄️  Starting backup at ${new Date().toISOString()}`);
  console.log(`   Output: ${backupSubDir}`);

  // Create backup directory
  fs.mkdirSync(backupSubDir, { recursive: true });

  // Step 1: MongoDB dump
  const mongoDumpDir = path.join(backupSubDir, 'db');
  console.log('\n📦 Step 1: MongoDB dump...');
  try {
    execSync(`mongodump --uri="${MONGO_URI}" --out="${mongoDumpDir}"`, {
      stdio: 'inherit',
      timeout: 120000
    });
    console.log('   ✅ MongoDB dump completed');
  } catch (err) {
    console.warn('   ⚠️  mongodump failed (is it installed?). Falling back to JSON export...');
    await exportCollectionsAsJson(mongoDumpDir);
  }

  // Step 2: Archive uploads
  console.log('\n📁 Step 2: Archiving uploads...');
  if (fs.existsSync(UPLOADS_DIR)) {
    const uploadsArchivePath = path.join(backupSubDir, 'uploads.zip');
    await archiveDirectory(UPLOADS_DIR, uploadsArchivePath);
    console.log(`   ✅ Uploads archived (${uploadsArchivePath})`);
  } else {
    console.log('   ⚠️  No uploads directory found, skipping');
  }

  // Step 3: Cleanup old backups (keep last 5)
  console.log('\n🧹 Step 3: Cleaning old backups...');
  cleanOldBackups(outputDir, 5);

  console.log(`\n✅ Backup completed: ${backupSubDir}`);
}

async function exportCollectionsAsJson(outDir) {
  // Fallback: use Mongoose to export each collection as JSON
  fs.mkdirSync(outDir, { recursive: true });

  const mongoose = require('mongoose');
  await mongoose.connect(MONGO_URI);

  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const col of collections) {
    try {
      const docs = await mongoose.connection.db.collection(col.name).find({}).toArray();
      const filePath = path.join(outDir, `${col.name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
      console.log(`   Exported ${col.name} (${docs.length} docs)`);
    } catch (e) {
      console.warn(`   Failed to export ${col.name}: ${e.message}`);
    }
  }

  await mongoose.disconnect();
}

function archiveDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, 'uploads');
    archive.finalize();
  });
}

function cleanOldBackups(backupsDir, keepCount) {
  try {
    const entries = fs.readdirSync(backupsDir)
      .filter(name => name.startsWith('backup-'))
      .map(name => ({
        name,
        full: path.join(backupsDir, name),
        mtime: fs.statSync(path.join(backupsDir, name)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);

    const toDelete = entries.slice(keepCount);
    for (const entry of toDelete) {
      fs.rmSync(entry.full, { recursive: true, force: true });
      console.log(`   Removed old backup: ${entry.name}`);
    }
    if (toDelete.length === 0) console.log('   No old backups to remove');
  } catch (e) {
    console.warn(`   Cleanup error: ${e.message}`);
  }
}

runBackup().catch(err => {
  console.error('❌ Backup failed:', err.message);
  process.exit(1);
});
