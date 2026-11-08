import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const out='/tmp/okgu-mobile-sheet-test-20261109';
await fs.mkdir(out,{recursive:true});
const workbook=Workbook.create();
const sheet=workbook.worksheets.add('11월');
const rows=[
 ['구분',8,9,10,11,12,13,14],
 ['', '일','월','화','수','목','금','토'],
 ['교육활동 추진업무','','1. 보존 일정 / 09:00 / 시험교실 / 시험교사\n2. 보존 독서 / 10:00 / 시험도서실 / 시험교사'],
 [],
 ['복무(출장, 연가 등)','','1. 시험 연수 / 15:00 / 시험장소 / 시험교사'],
 [],
 ['주요 참고사항','','시험 안내'],
 ['협의 및 건의']
].map(row=>Array.from({length:8},(_,i)=>row[i]??''));
sheet.getRange('A1:H8').values=rows;
sheet.getRange('A1:H8').format.font={name:'Arial',size:11};
sheet.getRange('A1:H8').format.columnWidthPx=170;
sheet.getRange('C1:C8').format.columnWidthPx=430;
sheet.getRange('A1:H8').format.rowHeight=38;
sheet.getRange('A3:H3').format.rowHeight=90;
sheet.getRange('A5:H5').format.rowHeight=70;
sheet.getRange('A1:H8').format.wrapText=true;
sheet.getRange('A1:H8').format.verticalAlignment='center';
sheet.getRange('A1:H2').format.fill='#E8EDF4';
sheet.getRange('A1:H2').format.font.bold=true;
workbook.recalculate();
console.log((await workbook.inspect({kind:'table',range:"'11월'!A1:H8",include:'values,formulas',tableMaxRows:8,tableMaxCols:8})).ndjson);
const preview=await workbook.render({sheetName:'11월',range:'A1:D8',scale:1.5});
await fs.writeFile(out+'/fixture.png',new Uint8Array(await preview.arrayBuffer()));
const xlsx=await SpreadsheetFile.exportXlsx(workbook);await xlsx.save(out+'/okgu-mobile-synthetic-test.xlsx');
console.log('Created synthetic test fixture only.');
