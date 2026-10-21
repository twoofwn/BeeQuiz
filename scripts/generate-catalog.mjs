import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const dataDir = path.resolve('data');
const files = [];
async function scan(dir) {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json') && !['index.json','manifest.json'].includes(entry.name.toLowerCase())) files.push(full);
  }
}
await mkdir(dataDir, {recursive:true});
await scan(dataDir);
const quizzes = [];
for (const file of files.sort()) {
  try {
    const text = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.questionsList) || data.questionsList.length === 0) {
      console.warn(`Skip: ${file} (missing questionsList)`); continue;
    }
    const rel = path.relative(dataDir, file).split(path.sep).join('/');
    quizzes.push({
      path: 'data/' + rel,
      name: String(data.name || data.title || path.basename(file, '.json').replace(/[-_]/g,' ')),
      count: data.questionsList.length
    });
  } catch(error) { console.warn(`Skip: ${file}: ${error.message}`); }
}
quizzes.sort((a,b)=>a.name.localeCompare(b.name,'vi',{numeric:true}));
await writeFile(path.join(dataDir,'index.json'), JSON.stringify({quizzes},null,2)+'\n','utf8');
console.log(`Generated data/index.json with ${quizzes.length} quiz subjects.`);
