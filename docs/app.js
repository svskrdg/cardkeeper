"use strict";
const $=id=>document.getElementById(id);
const names=["firstName","lastName","company","title","phone","phone2","email","website","address"];
let worker=null,previewUrl=null,busy=false;
function notify(message,ok=false){const el=$("message");el.textContent=message;el.classList.toggle("good",ok);el.classList.remove("hidden");el.scrollIntoView({behavior:"smooth",block:"nearest"});}
function loading(on,title,desc,pct=0){$("workingSection").classList.toggle("hidden",!on);if(title)$("workingTitle").textContent=title;if(desc)$("workingText").textContent=desc;$("progressBar").style.width=Math.round(Math.max(.04,Math.min(1,pct))*100)+"%";}
async function scriptOCR(){if(window.Tesseract)return window.Tesseract;await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";s.onload=resolve;s.onerror=()=>reject(Error("OCR cannot load. Check internet and retry."));document.head.appendChild(s)});return window.Tesseract;}
function parse(raw){
 const out=Object.fromEntries(names.map(n=>[n,""]));
 const lines=raw.split(/\r?\n/).map(s=>s.trim().replace(/\s+/g," ")).filter(Boolean);
 out.email=(raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[""])[0].toLowerCase();
 out.website=(raw.match(/(?:https?:\/\/)?www\.[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/i)||[""])[0];
 const address=/(?:strada|street|bulevard|blvd|avenue|road|sokak|cadde|caddesi|mahallesi|sector|postcode)/i;
 const org=/(?:\bsrl\b|\bs\.r\.l\b|\bltd\b|\binc\b|\bllc\b|\bgmbh\b|travel|tourism|turizm|hotel|agency|group|company|consulting)/i;
 const job=/(?:manager|director|founder|owner|ceo|sales|marketing|engineer|consultant|coordinator|specialist|administrator|müdür|yönetici|başkan|reprezentant)/i;
 const phones=[];
 for(const line of lines){
  if(/fax/i.test(line))continue;
  if(address.test(line)&&!out.address){out.address=line;continue;}
  if(job.test(line)&&!out.title&&!line.includes("@")){out.title=line;continue;}
  if(org.test(line)&&!out.company&&!line.includes("@")){out.company=line;continue;}
  if(!line.includes("@")&&!/https?:|www\./i.test(line)){
   const matches=line.match(/(?:\+|00)?\d[\d ()./-]{7,}\d/g)||[];
   for(const p of matches){const n=p.replace(/\D/g,"");if(n.length>=7&&n.length<=15&&!phones.includes(p.trim()))phones.push(p.trim());}
  }
 }
 out.phone=phones[0]||"";out.phone2=phones[1]||"";
 const candidates=lines.filter(line=>{
  if(/@|https?:|www\.|phone|mobile|mobil|tel\b|gsm|fax/i.test(line))return false;
  if(line.replace(/\D/g,"").length>=4||address.test(line)||org.test(line)||job.test(line))return false;
  const words=line.split(" ");return words.length>=2&&words.length<=4&&words.every(w=>/^\p{L}[\p{L}'-]*$/u.test(w));
 });
 if(candidates.length){const words=candidates[0].split(" ");out.firstName=words[0];out.lastName=words.slice(1).join(" ");}
 if(!out.company)out.company=lines.find(line=>line!==candidates[0]&&!/@|www\.|https?:/i.test(line)&&line.replace(/\D/g,"").length<4&&!job.test(line)&&!address.test(line))||"";
 if(!out.website&&out.email&&!/@(?:gmail|hotmail|outlook|icloud|yahoo|proton)\./i.test(out.email))out.website=out.email.split("@")[1];
 return out;
}
async function scan(file){
 if(busy||!file)return;
 if(!file.type.startsWith("image/")){notify("Please select an image.");return;}
 if(file.size>35e6){notify("Photo is too large.");return;}
 busy=true;$("message").classList.add("hidden");loading(true,"Reading card…","Preparing image",.05);
 let sourceUrl;
 try{
  sourceUrl=URL.createObjectURL(file);const img=new Image();img.src=sourceUrl;await img.decode();
  const scale=Math.min(1,2000/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement("canvas");canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
  canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewUrl=URL.createObjectURL(await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(Error("Image error.")),"image/jpeg",.85)));
  $("photoPreview").src=previewUrl;await scriptOCR();
  loading(true,"Recognizing text…","Downloading language files if necessary",.08);
  worker=await Tesseract.createWorker($("lang").value,1,{logger:m=>{if(m.status==="recognizing text")loading(true,"Recognizing text…","Progress: "+Math.round(m.progress*100)+"%",.15+m.progress*.85);else loading(true,"Preparing OCR…",m.status,.08);}});
  const result=await worker.recognize(canvas),raw=(result.data.text||"").trim();
  if(!raw)throw Error("No text recognized. Try a clearer photo.");
  const contact=parse(raw);for(const k of names)$(k).value=contact[k]||"";
  $("rawText").value=raw;$("resultsSection").classList.remove("hidden");
  $("resultsSection").scrollIntoView({behavior:"smooth",block:"start"});
 }catch(e){notify(e.message||"Scan failed.");}
 finally{if(sourceUrl)URL.revokeObjectURL(sourceUrl);if(worker){try{await worker.terminate()}catch(e){}worker=null;}loading(false);busy=false;$("cameraInput").value="";$("photoInput").value="";}
}
function esc(value){return String(value||"").replace(/\r\n?/g,"\n").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,");}
function folded(line){let parts=[],current="",count=0;for(const ch of line){const size=new TextEncoder().encode(ch).length;if(count+size>75){parts.push(current);current=" ";count=1;}current+=ch;count+=size;}parts.push(current);return parts.join("\r\n");}
function vcard(d){
 const n=[d.firstName,d.lastName].filter(Boolean).join(" ")||d.company||"New Contact";
 const lines=["BEGIN:VCARD","VERSION:3.0","N:"+[d.lastName,d.firstName,"","",""].map(esc).join(";"),"FN:"+esc(n)];
 if(d.company)lines.push("ORG:"+esc(d.company));
 if(d.title)lines.push("TITLE:"+esc(d.title));
 if(d.phone)lines.push("TEL;TYPE=CELL:"+esc(d.phone));
 if(d.phone2)lines.push("TEL;TYPE=WORK:"+esc(d.phone2));
 if(d.email)lines.push("EMAIL;TYPE=WORK:"+esc(d.email));
 if(d.website)lines.push("URL:"+esc(d.website));
 if(d.address)lines.push("ADR;TYPE=WORK:;;"+esc(d.address)+";;;;");
 lines.push("END:VCARD");
 return lines.map(folded).join("\r\n")+"\r\n";
}
function download(file){const url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notify("VCF ready. Open it from Safari Downloads or Files, then choose Create New Contact.",true);}
async function save(e){
 if(e)e.preventDefault();
 const d=Object.fromEntries(names.map(n=>[n,$(n).value.trim()]));
 if(!d.firstName&&!d.lastName&&!d.company){notify("Enter at least a name or company.");return;}
 const title=([d.firstName,d.lastName].filter(Boolean).join("_")||d.company||"Contact").replace(/[^\p{L}\p{N}_.-]+/gu,"_").slice(0,50)+".vcf";
 const file=new File([vcard(d)],title,{type:"text/vcard"});
 if(navigator.canShare&&navigator.canShare({files:[file]})){
  try{await navigator.share({files:[file],title:"Save contact"});notify("VCF shared. Open the contact file and confirm Create New Contact.",true);return;}
  catch(error){if(error.name==="AbortError")return;}
 }
 download(file);
}
for(const id of ["cameraInput","photoInput"])$(id).addEventListener("change",e=>{if(e.target.files?.[0])scan(e.target.files[0]);});
$("contactForm").addEventListener("submit",save);
$("shareContactButton").addEventListener("click",save);
$("newScanButton").addEventListener("click",()=>{$("resultsSection").classList.add("hidden");$("cameraInput").click();});
$("installHelp").addEventListener("click",()=>$("installDialog").showModal());
$("closeDialog").addEventListener("click",()=>$("installDialog").close());
$("dialogOK").addEventListener("click",()=>$("installDialog").close());
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
