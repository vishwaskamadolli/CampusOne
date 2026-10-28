import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const files=['src/server.js','src/app.js',...readdirSync('src/routes').map(f=>join('src/routes',f)),...readdirSync('src/models').map(f=>join('src/models',f))].filter(f=>f.endsWith('.js'));
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1)}
console.log(`Checked ${files.length} JavaScript files.`);
