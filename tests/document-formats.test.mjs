import test from 'node:test';import assert from 'node:assert/strict';import {mkdir,writeFile,rm} from 'node:fs/promises';import {zipSync,strToU8} from 'fflate';import {parseDocument} from '../server/documentIntelligence.js';import {executeToolCall} from '../server/toolExecutor.js';
function pdf(text){const stream=`BT /F1 12 Tf 72 720 Td (${text}) Tj ET`,objects=['1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj','2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj','3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj','4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',`5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`];let out='%PDF-1.4\n',offsets=[0];for(const object of objects){offsets.push(Buffer.byteLength(out));out+=`${object}\n`;}const xref=Buffer.byteLength(out);out+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer << /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(out);}
test('real PDF, DOCX, PPTX, and XLSX parsers retain page/slide/sheet provenance',async()=>{
 const dir=`tmp-docs-${Date.now()}`;await mkdir(dir);try{
  await writeFile(`${dir}/sample.pdf`,pdf('PDF marker'));
  await writeFile(`${dir}/sample.docx`,zipSync({'word/document.xml':strToU8('<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>DOCX marker</w:t></w:r></w:p></w:body></w:document>')}));
  await writeFile(`${dir}/sample.pptx`,zipSync({'ppt/slides/slide1.xml':strToU8('<p:sld xmlns:p="p" xmlns:a="a"><a:t>PPTX marker</a:t></p:sld>')}));
  await writeFile(`${dir}/sample.xlsx`,zipSync({'xl/sharedStrings.xml':strToU8('<sst><si><t>XLSX marker</t></si></sst>'),'xl/worksheets/sheet1.xml':strToU8('<worksheet><sheetData><row><c t="s"><v>0</v></c></row></sheetData></worksheet>')}));
  const parsed={};for(const kind of ['pdf','docx','pptx','xlsx'])parsed[kind]=await parseDocument({path:`${dir}/sample.${kind}`});
  assert.match(parsed.pdf.content,/PDF marker/);assert.equal(parsed.pdf.chunks[0].page,1);assert.match(parsed.docx.content,/DOCX marker/);assert.equal(parsed.pptx.chunks[0].slide,1);assert.equal(parsed.xlsx.chunks[0].sheet,1);assert.match(parsed.xlsx.content,/XLSX marker/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('ingested documents support canonical provenance search and extractive summaries',async()=>{
 const state={runs:[],approvals:[],activity:[],runtime:{},documents:[]};const ingested=await executeToolCall({toolName:'documents.ingest',arguments:{name:'decision.md',content:'# Decision\nUse canonical tools. Verification is mandatory.'}},{state});assert.equal(ingested.status,'completed');const id=ingested.output.document.id;
 const search=await executeToolCall({toolName:'documents.search',arguments:{documentId:id,query:'verification'}},{state});assert.equal(search.output.matches.length,1);assert.equal(search.output.matches[0].sourcePath,'decision.md');
 const summary=await executeToolCall({toolName:'documents.summarize',arguments:{documentId:id,maxCharacters:500}},{state});assert.match(summary.output.summary,/canonical tools/);assert.equal(summary.output.method,'deterministic-extractive');
});
