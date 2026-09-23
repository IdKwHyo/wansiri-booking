import ts from 'typescript';
import fs from 'node:fs';
fs.mkdirSync('.test-runtime',{recursive:true});
for(const name of ['contracts','assistant']){const source=fs.readFileSync('lib/'+name+'.ts','utf8');fs.writeFileSync('.test-runtime/'+name+'.mjs',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./contracts'","'./contracts.mjs'"));}
await import('../tests/assistant.test.mjs');
