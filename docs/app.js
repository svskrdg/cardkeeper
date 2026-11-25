"use strict";
const $ = id => document.getElementById(id);
const FIELDS = ["firstName", "lastName", "company", "title", "phone", "phone2", "email", "website", "address"];
const FIELD_LABELS = {
  fullName:"Full name",firstName:"First name",lastName:"Last name",company:"Company",
  title:"Job title",phone:"Phone",phone2:"Second phone",email:"Email",website:"Website",address:"Address"
};
let worker=null, imageFile=null, imageAngle=0, previewURL=null, running=false;

function notice(text, ok=false) {
  const el=$("message");el.textContent=text;el.classList.toggle("good",ok);
  el.classList.remove("hidden");el.scrollIntoView({behavior:"smooth",block:"nearest"});
}
function progress(enabled, title, detail, fraction=.05){
  $("workingSection").classList.toggle("hidden",!enabled);
  if(title)$("workingTitle").textContent=title;
  if(detail)$("workingText").textContent=detail;
  $("progressBar").style.width=Math.round(Math.min(1,Math.max(.04,fraction))*100)+"%";
}
function showCard(hasImage){
  $("resultsSection").classList.remove("hidden");
  document.querySelector(".preview-wrap").classList.toggle("hidden",!hasImage);
  document.querySelector(".photo-controls").classList.toggle("hidden",!hasImage);
  $("resultsSection").scrollIntoView({behavior:"smooth",block:"start"});
}
function showResults(raw,hasImage,confidence){
  const data=window.CardKeeperParser.parseCard(raw);
  for(const name of FIELDS)$(name).value=data.fields[name]||"";
  $("rawText").value=raw;
  const issues=[...data.warnings];
  if(Number.isFinite(confidence)&&confidence<58)issues.unshift("Text recognition confidence is low. Try a sharper photo, choose the card language, or use Apple Live Text.");
  const el=$("scanWarnings");
  el.replaceChildren();
  if(issues.length) {
    const heading=document.createElement("strong");heading.textContent="Please check:";
    const list=document.createElement("ul");
    for(const issue of issues){const li=document.createElement("li");li.textContent=issue;list.appendChild(li);}
    el.append(heading,list);el.classList.remove("hidden");
  }else el.classList.add("hidden");
  renderLines(data.lines);
  showCard(hasImage);
}
function renderLines(lines){
  const container=$("recognizedLines");container.replaceChildren();
  for(const info of lines){
    const row=document.createElement("div");row.className="recognized-row";
    const phrase=document.createElement("span");phrase.className="recognized-phrase";phrase.textContent=info.text;
    const select=document.createElement("select");select.className="recognized-pick";select.setAttribute("aria-label","Assign recognized text to contact field");
    for(const [value,label] of Object.entries({"":"Use as…",...FIELD_LABELS})){
      const opt=document.createElement("option");opt.value=value;opt.textContent=label;select.appendChild(opt);
    }
    select.addEventListener("change",()=>{
      const field=select.value;if(!field)return;
      if(field==="fullName"){
        const words=info.text.trim().split(/\s+/);$("firstName").value=words.shift()||"";
        $("lastName").value=words.join(" ");
      }else{
        let text=info.text.trim();
        if(field==="email"){
          const m=text.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i);if(m)text=m[0];
        }
        if(field==="phone"||field==="phone2"){
          const numbers=window.CardKeeperParser.phoneNumbers(text);
          if(numbers.length)text=numbers[0];
        }
        $(field).value=text;
      }
      row.classList.add("assigned");select.value="";
      const target=field==="fullName"?"firstName":field;
      $(target).scrollIntoView({behavior:"smooth",block:"center"});
      $(target).focus();
    });
    row.append(phrase,select);container.appendChild(row);
  }
  if(!lines.length){container.textContent="No lines recognized. Try Apple Live Text or type the contact details manually.";}
}
async function ensureOCR(){
  if(window.Tesseract)return;
  await new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    script.onload=resolve;
    script.onerror=()=>reject(new Error("Unable to load OCR. Check your connection and retry."));
    document.head.appendChild(script);
  });
}
async function canvasFromPhoto(file,rotation){
  const source=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=source;await image.decode();
    const scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));
    const width=Math.max(1,Math.round(image.naturalWidth*scale));
    const height=Math.max(1,Math.round(image.naturalHeight*scale));
    const turned=rotation%180!==0;
    const canvas=document.createElement("canvas");
    canvas.width=turned?height:width;canvas.height=turned?width:height;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);
    ctx.drawImage(image,-width/2,-height/2,width,height);
    return canvas;
  }finally{URL.revokeObjectURL(source);}
}
function enhanceCanvas(original){
  const canvas=document.createElement("canvas");canvas.width=original.width;canvas.height=original.height;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(original,0,0);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
  // Mild contrast normalization retains more details than aggressive black/white thresholding.
  let min=255,max=0;const histogram=new Uint32Array(256);
  for(let i=0;i<data.length;i+=4)histogram[Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2])]++;
  const count=canvas.width*canvas.height,trim=Math.floor(count*.01);let acc=0;
  for(let i=0;i<256;i++){acc+=histogram[i];if(acc>=trim){min=i;break;}}
  acc=0;
  for(let i=255;i>=0;i--){acc+=histogram[i];if(acc>=trim){max=i;break;}}
  const range=Math.max(55,max-min);
  for(let i=0;i<data.length;i+=4){
    const luminosity=.299*data[i]+.587*data[i+1]+.114*data[i+2];
    const normalized=Math.max(0,Math.min(255,((luminosity-min)*255/range-128)*1.08+128));
    data[i]=data[i+1]=data[i+2]=normalized;
  }
  ctx.putImageData(pixels,0,0);
  return canvas;
}
function evaluateOCR(result){
  const raw=(result.data.text||"").trim();
  const parsed=window.CardKeeperParser.parseCard(raw).fields;
  const hits=[parsed.email,parsed.website,parsed.phone,parsed.company,parsed.title].filter(Boolean).length;
  const garbled=(raw.match(/[�]|[ÃÂ](?=\S)/g)||[]).length;
  const gibberish=(raw.match(/[^a-z0-9À-žĞğŞşİıÖöÜüÇç@.:/\s+()\-]/gi)||[]).length;
  const confidence=Number(result.data.confidence)||0;
  return {raw,confidence,score:confidence*.65+hits*13-Math.min(20,garbled*8)-Math.min(14,gibberish*.6)};
}
async function scanImage(file){
  if(!file||running)return;
  if(!file.type.startsWith("image/")){notice("Choose an image file.");return;}
  if(file.size>35*1024*1024){notice("Photo is too large. Try a smaller image.");return;}
  imageFile=file;running=true;$("message").classList.add("hidden");
  progress(true,"Preparing your card","Resizing image for recognition",.03);
  try{
    const canvas=await canvasFromPhoto(file,imageAngle);
    if(previewURL)URL.revokeObjectURL(previewURL);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Could not process this image.")),"image/jpeg",.91));
    previewURL=URL.createObjectURL(blob);$("photoPreview").src=previewURL;
    await ensureOCR();
    progress(true,"Loading OCR","Card image stays on your device",.07);
    worker=await window.Tesseract.createWorker($("lang").value,1,{logger:status=>{
      if(status.status==="recognizing text"){
        progress(true,"Recognizing text","Reading characters: "+Math.round((status.progress||0)*100)+"%",.12+(status.progress||0)*.38);
      }else if(status.status)progress(true,"Preparing OCR",status.status,.07);
    }});
    await worker.setParameters({tessedit_pageseg_mode:"11",preserve_interword_spaces:"1",user_defined_dpi:"300"});
    const first=evaluateOCR(await worker.recognize(canvas));
    let best=first;
    if($("enhance").checked){
      progress(true,"Enhanced second pass","Comparing OCR results",.55);
      await worker.setParameters({tessedit_pageseg_mode:"3",preserve_interword_spaces:"1",user_defined_dpi:"300"});
      const second=evaluateOCR(await worker.recognize(enhanceCanvas(canvas)));
      if(second.score>best.score+2)best=second;
    }
    if(!best.raw)throw Error("Could not read the card. Try a brighter photo or use Apple Live Text.");
    showResults(best.raw,true,best.confidence);
    if(best.confidence<65)notice("OCR confidence was low. Select the correct card language or use Apple Live Text. Review every field before saving.");
  }catch(error){
    notice((error&&error.message)||"OCR failed. Use Apple Live Text or retry.");
  }finally{
    if(worker){try{await worker.terminate();}catch(error){}worker=null;}
    progress(false);running=false;
    $("cameraInput").value="";$("photoInput").value="";
  }
}
function esc(value){return String(value||"").replace(/\r\n?/g,"\n").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,");}
function folded(line){
  const result=[];let part="",bytes=0;
  for(const character of line){
    const size=new TextEncoder().encode(character).length;
    if(bytes+size>75){result.push(part);part=" ";bytes=1;}
    part+=character;bytes+=size;
  }
  result.push(part);return result.join("\r\n");
}
function vcard(d){
  const fullname=[d.firstName,d.lastName].filter(Boolean).join(" ")||d.company||"New Contact";
  const lines=["BEGIN:VCARD","VERSION:3.0","N:"+[d.lastName,d.firstName,"","",""].map(esc).join(";"),"FN:"+esc(fullname)];
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
function downloadVCF(file){
  const url=URL.createObjectURL(file),a=document.createElement("a");
  a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  notice("Contact file downloaded. Open .vcf in Files or Safari Downloads, then tap Create New Contact.",true);
}
async function saveContact(event){
  if(event)event.preventDefault();
  const data=Object.fromEntries(FIELDS.map(name=>[name,$(name).value.trim()]));
  if(!data.firstName&&!data.lastName&&!data.company){notice("Please enter a name or company.");return;}
  const filename=([data.firstName,data.lastName].filter(Boolean).join("_")||data.company||"Contact")
    .replace(/[^\p{L}\p{N}_.-]+/gu,"_").slice(0,50)+".vcf";
  const file=new File([vcard(data)],filename,{type:"text/vcard"});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],title:"Save contact"});
      notice("Contact file shared. Import it through the iPhone contact confirmation screen.",true);return;
    }catch(error){if(error.name==="AbortError")return;}
  }
  downloadVCF(file);
}
for(const input of ["cameraInput","photoInput"]){
  $(input).addEventListener("change",event=>{const file=event.target.files&&event.target.files[0];if(file){imageAngle=0;scanImage(file);}});
}
$("contactForm").addEventListener("submit",saveContact);
$("shareContactButton").addEventListener("click",saveContact);
$("newScanButton").addEventListener("click",()=>{$("cameraInput").click();});
$("rotateButton").addEventListener("click",()=>{if(imageFile&&!running){imageAngle=(imageAngle+90)%360;scanImage(imageFile);}});
$("retryOCR").addEventListener("click",()=>{if(imageFile&&!running)scanImage(imageFile);});
$("reparseText").addEventListener("click",()=>{const raw=$("rawText").value.trim();if(raw)showResults(raw,Boolean(imageFile),null);});
$("parseLiveText").addEventListener("click",()=>{
  const text=$("liveTextInput").value.trim();
  if(!text){notice("Paste text or use the iPhone Scan Text menu in the box first.");return;}
  imageFile=null;showResults(text,false,null);
});
$("installHelp").addEventListener("click",()=>$("installDialog").showModal());
$("closeDialog").addEventListener("click",()=>$("installDialog").close());
$("dialogOK").addEventListener("click",()=>$("installDialog").close());
if("serviceWorker" in navigator)window.addEventListener("load",()=>{
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
});
