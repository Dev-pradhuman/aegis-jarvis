import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { unzipSync, strFromU8 } from 'fflate';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileWorkspaceRoot } from './fileTools.js';

const supported=new Set(['.txt','.md','.json','.csv','.html','.htm','.pdf','.docx','.pptx','.xlsx']);
function failure(code,message){return Object.assign(new Error(message),{code});}
function entities(value){return String(value).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
function xmlText(xml,tag='(?:w:t|a:t|t)'){return entities(String(xml).replace(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/(?:w:t|a:t|t)>`,'g'),' $1 ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function ordered(zip,prefix,pattern){return Object.keys(zip).filter(name=>name.startsWith(prefix)&&pattern.test(name)).sort((a,b)=>Number(a.match(/(\d+)/)?.[1]||0)-Number(b.match(/(\d+)/)?.[1]||0));}
function chunkSections(sections,source,documentId){const chunks=[];let index=0,offset=0;for(const section of sections){const paragraphs=String(section.text||'').split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/).map(value=>value.trim()).filter(Boolean);let current='';let start=offset;for(const paragraph of paragraphs){if(current&&current.length+paragraph.length+1>1500){chunks.push({documentId,sourcePath:source,index:index++,text:current,characterStart:start,characterEnd:start+current.length,...section.provenance});offset=start+current.length+1;start=offset;current='';}current+=`${current?' ':''}${paragraph}`;}if(current){chunks.push({documentId,sourcePath:source,index:index++,text:current,characterStart:start,characterEnd:start+current.length,...section.provenance});offset=start+current.length+1;}}return chunks;}

function parseSimplePdfText(buffer){
 const source=buffer.toString('latin1'),pages=[];
 const pageObjects=[...source.matchAll(/\/Type\s*\/Page\b[\s\S]*?endobj/g)];
 const streams=[...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(match=>match[1]);
 for(const [index,stream] of streams.entries()){
  const fragments=[...stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(match=>match[1].replace(/\\([()\\])/g,'$1').replace(/\\n/g,'\n').replace(/\\r/g,'\r'));
  const text=fragments.join(' ').replace(/\s+/g,' ').trim();if(text)pages.push({text,provenance:{page:Math.min(index+1,Math.max(1,pageObjects.length))}});
 }
 return pages;
}
async function parsePdf(buffer){const pages=[];try{await pdfParse(buffer,{pagerender:async page=>{const content=await page.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false});const text=content.items.map(item=>item.str).join(' ').replace(/\s+/g,' ').trim();pages.push({text,provenance:{page:pages.length+1}});return text;}});return pages;}catch(error){const fallback=parseSimplePdfText(buffer);if(fallback.length)return fallback;throw failure('INVALID_ARGUMENTS',`PDF could not be parsed: ${error.message}`);}}
function parseDocx(buffer){const zip=unzipSync(buffer),xml=zip['word/document.xml'];if(!xml)throw failure('INVALID_ARGUMENTS','DOCX document.xml is missing.');const source=strFromU8(xml);return[...source.matchAll(/<w:p[\s\S]*?<\/w:p>/g)].map(match=>{const heading=match[0].match(/<w:pStyle[^>]*w:val="Heading(\d+)"/i);return{text:xmlText(match[0],'w:t'),provenance:heading?{headingLevel:Number(heading[1])}:{}};}).filter(item=>item.text);}
function parsePptx(buffer){const zip=unzipSync(buffer);return ordered(zip,'ppt/slides/',/slide\d+\.xml$/).map((name,index)=>({text:xmlText(strFromU8(zip[name]),'a:t'),provenance:{slide:index+1}})).filter(item=>item.text);}
function parseXlsx(buffer){const zip=unzipSync(buffer);const shared=zip['xl/sharedStrings.xml']?[...strFromU8(zip['xl/sharedStrings.xml']).matchAll(/<si[\s\S]*?<\/si>/g)].map(match=>xmlText(match[0],'t')):[];return ordered(zip,'xl/worksheets/',/sheet\d+\.xml$/).map((name,index)=>{const xml=strFromU8(zip[name]),rows=[];for(const row of xml.matchAll(/<row[\s\S]*?<\/row>/g)){const cells=[];for(const cell of row[0].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)){const type=/\bt="([^"]+)"/.exec(cell[1])?.[1],raw=/<v[^>]*>([\s\S]*?)<\/v>/.exec(cell[2])?.[1]??xmlText(cell[2],'t');cells.push(type==='s'?shared[Number(raw)]??'':entities(raw));}rows.push(cells.join('\t'));}return{text:rows.join('\n'),provenance:{sheet:index+1,sheetPath:name}};}).filter(item=>item.text);}

export async function parseDocument(input={}){
 let buffer,source,extension;
 if(input.content!==undefined){source=input.name||'supplied.txt';extension=path.extname(source).toLowerCase()||'.txt';buffer=Buffer.from(String(input.content),'utf8');}
 else{const candidate=path.resolve(fileWorkspaceRoot,String(input.path||'')),root=await realpath(fileWorkspaceRoot),actual=await realpath(candidate);if(actual!==root&&!actual.startsWith(`${root}${path.sep}`))throw failure('PERMISSION_DENIED','Document path escapes the workspace.');const info=await stat(actual);if(!info.isFile()||info.size>25*1024*1024)throw failure('INVALID_ARGUMENTS','Document must be a file no larger than 25 MB.');buffer=await readFile(actual);source=path.relative(root,actual).replaceAll('\\','/');extension=path.extname(actual).toLowerCase();}
 if(!supported.has(extension))throw failure('CAPABILITY_UNAVAILABLE',`Unsupported document format: ${extension||'unknown'}`);
 let sections;
 if(extension==='.pdf')sections=await parsePdf(buffer);else if(extension==='.docx')sections=parseDocx(buffer);else if(extension==='.pptx')sections=parsePptx(buffer);else if(extension==='.xlsx')sections=parseXlsx(buffer);else{let text=buffer.toString('utf8');if(extension==='.json'){try{text=JSON.stringify(JSON.parse(text),null,2);}catch{throw failure('INVALID_ARGUMENTS','JSON document is invalid.');}}if(['.html','.htm'].includes(extension))text=xmlText(text,'(?:title|h[1-6]|p|li|td|th)');sections=[{text,provenance:{section:'content'}}];}
 const id=input.documentId||`document-${Date.now()}`;const allChunks=chunkSections(sections,source,id),chunks=[];let storedCharacters=0;for(const chunk of allChunks){if(chunks.length>=2000||storedCharacters+chunk.text.length>2_000_000)break;chunks.push(chunk);storedCharacters+=chunk.text.length;}const content=chunks.map(chunk=>chunk.text).join('\n\n');return{id,name:String(input.name||source),sourcePath:source,format:extension.slice(1),bytes:buffer.length,characters:content.length,sections:sections.length,chunks,truncated:chunks.length<allChunks.length,content,createdAt:new Date().toISOString()};
}

export function searchDocument(document,query,limit=20){const terms=String(query||'').toLowerCase().split(/\s+/).filter(Boolean);return(document.chunks||[]).map(chunk=>({chunk,score:terms.reduce((sum,term)=>sum+(chunk.text.toLowerCase().includes(term)?1:0),0)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score).slice(0,limit).map(item=>({...item.chunk,score:item.score}));}
export function summarizeDocument(document,maxCharacters=2000){const ranked=(document.chunks||[]).map(chunk=>({...chunk,score:(chunk.heading?2:0)+Math.min(1,chunk.text.length/500)})).sort((a,b)=>b.score-a.score);let summary='';for(const chunk of ranked){if(summary.length>=maxCharacters)break;summary+=`${summary?'\n\n':''}${chunk.text.slice(0,maxCharacters-summary.length)}`;}return{summary,method:'deterministic-extractive',sourcePath:document.sourcePath,chunkIds:ranked.slice(0,Math.max(1,summary.split('\n\n').length)).map(chunk=>chunk.index)};}
export function compareDocuments(left,right){const words=value=>new Set(String(value.content||'').toLowerCase().match(/[a-z0-9]{3,}/g)||[]),a=words(left),b=words(right),shared=[...a].filter(word=>b.has(word));return{leftId:left.id,rightId:right.id,similarity:a.size||b.size?shared.length/new Set([...a,...b]).size:1,sharedTerms:shared.slice(0,100),leftOnly:[...a].filter(word=>!b.has(word)).slice(0,100),rightOnly:[...b].filter(word=>!a.has(word)).slice(0,100),method:'deterministic-term-comparison'};}
