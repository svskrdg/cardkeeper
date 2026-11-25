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
    // Small downloaded/screenshot cards need upscaling; otherwise 8px labels are unreadable.
    const scale=Math.min(5,2400/Math.max(image.naturalWidth,image.naturalHeight));
    const width=Math.max(1,Math.round(image.naturalWidth*scale));
    const height=Math.max(1,Math.round(image.naturalHeight*scale));
    const turned=rotation%180!==0;
    const canvas=document.createElement("canvas");
    canvas.width=turned?height:width;canvas.height=turned?width:height;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
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

function regionCanvas(source,x,y,w,h){
  const out=document.createElement("canvas");
  const sx=Math.max(0,Math.round(source.width*x)), sy=Math.max(0,Math.round(source.height*y));
  const sw=Math.max(1,Math.min(source.width-sx,Math.round(source.width*w)));
  const sh=Math.max(1,Math.min(source.height-sy,Math.round(source.height*h)));
  out.width=sw;out.height=sh;
  out.getContext("2d").drawImage(source,sx,sy,sw,sh,0,0,sw,sh);
  return out;
}
function mergeReads(resultList) {
  const unique=[],keys=new Set();
  for(const entry of resultList){
    const lines=entry.raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    for(const line of lines){
      if(line.length<3 || /^[^a-zA-ZÀ-žĞğŞşİıÖöÜüÇç0-9]*$/.test(line))continue;
      const key=line.toLocaleLowerCase().replace(/^[^a-z0-9À-žğüşöçı]+/iu,"").replace(/[^\p{L}\p{N}@]+/gu,"");
      if(key.length<3 || keys.has(key))continue;
      keys.add(key);unique.push(line);
    }
  }
  return unique.join("\n");
}
async function scanImage(file){
  if(!file||running)return;
  if(!file.type.startsWith("image/")){notice("Choose an image file.");return;}
  if(file.size>35*1024*1024){notice("Photo is too large. Try a smaller image.");return;}
  imageFile=file;running=true;$("message").classList.add("hidden");
  progress(true,"Preparing your card","Loading image at readable resolution",.03);
  try{
    const canvas=await canvasFromPhoto(file,imageAngle);
    if(previewURL)URL.revokeObjectURL(previewURL);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Could not process this image.")),"image/jpeg",.94));
    previewURL=URL.createObjectURL(blob);$("photoPreview").src=previewURL;
    await ensureOCR();
    progress(true,"Loading OCR","Image processing stays on your device",.07);
    worker=await window.Tesseract.createWorker($("lang").value,1,{logger:status=>{
      if(status.status==="recognizing text")
        progress(true,"Recognizing text","Reading characters: "+Math.round((status.progress||0)*100)+"%",.13+(status.progress||0)*.19);
      else if(status.status)progress(true,"Preparing OCR",status.status,.07);
    }});
    const reads=[];
    async function recognize(input, mode, label, fraction) {
      progress(true,"Reading "+label,"OCR analysis on your iPhone",fraction);
      await worker.setParameters({tessedit_pageseg_mode:mode,preserve_interword_spaces:"1",user_defined_dpi:"300"});
      const result=evaluateOCR(await worker.recognize(input));
      reads.push({...result,label});
      return result;
    }
    // Use sparse layout for the entire card; avoid assumptions about font, columns or logo.
    const full=await recognize(canvas,"11","full card",.15);
    if($("enhance").checked){
      // Dense text and small accent characters usually need a different page layout.
      await recognize(enhanceCanvas(canvas),"6","enhanced card",.33);
      const tall=canvas.height>canvas.width*.90;
      // Business cards pictured front-and-back (stacked) need independent OCR zones.
      if(tall) {
        await recognize(regionCanvas(canvas,.04,.025,.66,.24),"6","upper details",.48);
        await recognize(regionCanvas(canvas,.04,.27,.66,.21),"6","lower details",.64);
        await recognize(regionCanvas(canvas,.12,.112,.52,.078),"6","role/title",.74);
        await recognize(regionCanvas(canvas,.18,.65,.64,.22),"6","company/logo",.84);
      }else{
        await recognize(regionCanvas(canvas,.02,.04,.76,.50),"6","upper details",.51);
        await recognize(regionCanvas(canvas,.02,.49,.88,.49),"6","lower details",.75);
      }
    }
    // Put the focused regions before the full card to avoid choosing graphics as a person.
    const byPriority=reads.slice().sort((a,b)=>{
      const priority={ "upper details":0,"role/title":1,"lower details":2,"enhanced card":3,"full card":4,"company/logo":5};
      return priority[a.label]-priority[b.label];
    });
    const raw=mergeReads(byPriority);
    if(!raw)throw Error("Could not read the card. Crop just the text side or use Apple Live Text.");
    const confidence=reads.reduce((max,item)=>Math.max(max,item.confidence||0),0);
    showResults(raw,true,confidence);
    // The full image may retain an email address that focused crops misread.
    // In case of near-identical domains, prioritize the email detected in the full pass,
    // while leaving every line available for the user to review.
    const emailFromFull=window.CardKeeperParser.parseCard(full.raw).fields.email;
    const emailFromParts=$("email").value;
    if(emailFromFull&&emailFromParts&&emailFromFull!==emailFromParts) {
      const localA=emailFromFull.split("@")[0],localB=emailFromParts.split("@")[0];
      if(localA===localB) {
        $("email").value=emailFromFull;
        const www=($("website").value||"").replace(/^https?:\/\//i,"").replace(/^www\./i,"");
        const domain=emailFromFull.split("@")[1];
        if(www){
          const tail=www.split(/[\/:?#]/)[0];
          let differences=Math.abs(tail.length-domain.length);
          if(differences<=2){for(let i=0;i<Math.min(tail.length,domain.length);i++)if(tail[i]!==domain[i])differences++;}
          if(differences<=2)$("website").value="www."+domain;
        }
      }
    }
    if(confidence<60)notice("This photo is difficult to read. Crop to the card's front, or use Apple Live Text, before saving.");
  }catch(error){
    notice((error&&error.message)||"OCR failed. Use Apple Live Text or crop a clearer photo.");
    if(imageFile)showCard(true);
  }finally{
    if(worker){try{await worker.terminate();}catch(error){}worker=null;}
    progress(false);running=false;
    $("cameraInput").value="";$("photoInput").value="";
  }
}

let cropSource=null,cropStart=null,cropEnd=null,cropDragging=false;
function cropCoord(event){
  const rect=$("cropCanvas").getBoundingClientRect();
  const canvas=$("cropCanvas");
  return {
    x:Math.max(0,Math.min(canvas.width,(event.clientX-rect.left)*canvas.width/rect.width)),
    y:Math.max(0,Math.min(canvas.height,(event.clientY-rect.top)*canvas.height/rect.height))
  };
}
function paintCrop(){
  const canvas=$("cropCanvas"),ctx=canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!cropSource)return;
  ctx.drawImage(cropSource,0,0,canvas.width,canvas.height);
  if(cropStart&&cropEnd){
    const x=Math.min(cropStart.x,cropEnd.x),y=Math.min(cropStart.y,cropEnd.y);
    const w=Math.abs(cropStart.x-cropEnd.x),h=Math.abs(cropStart.y-cropEnd.y);
    ctx.fillStyle="rgba(11,21,48,.35)";
    ctx.fillRect(0,0,canvas.width,y);
    ctx.fillRect(0,y,x,h);
    ctx.fillRect(x+w,y,canvas.width-x-w,h);
    ctx.fillRect(0,y+h,canvas.width,canvas.height-y-h);
    ctx.strokeStyle="#ffeb61";ctx.lineWidth=3;ctx.strokeRect(x,y,w,h);
  }
}
async function startCrop(){
  if(!imageFile||running)return;
  try{
    cropSource=await canvasFromPhoto(imageFile,imageAngle);
    const view=$("cropCanvas"),maxWidth=Math.min(430,window.innerWidth-76);
    const scale=Math.min(1,maxWidth/cropSource.width,window.innerHeight*.57/cropSource.height);
    view.width=Math.max(1,Math.round(cropSource.width*scale));
    view.height=Math.max(1,Math.round(cropSource.height*scale));
    cropStart=null;cropEnd=null;$("applyCropButton").disabled=true;
    $("cropDialog").showModal();paintCrop();
  }catch(err){notice(err.message||"Couldn't open crop tool.");}
}
const cropCanvas=$("cropCanvas");
cropCanvas.addEventListener("pointerdown",event=>{
  cropDragging=true;cropStart=cropCoord(event);cropEnd=cropStart;
  cropCanvas.setPointerCapture(event.pointerId);paintCrop();
});
cropCanvas.addEventListener("pointermove",event=>{
  if(!cropDragging)return;cropEnd=cropCoord(event);paintCrop();
});
cropCanvas.addEventListener("pointerup",event=>{
  if(!cropDragging)return;cropDragging=false;cropEnd=cropCoord(event);
  $("applyCropButton").disabled=Math.abs(cropEnd.x-cropStart.x)<22||Math.abs(cropEnd.y-cropStart.y)<18;
  paintCrop();
});
cropCanvas.addEventListener("pointercancel",()=>cropDragging=false);
$("cropButton").addEventListener("click",startCrop);
$("closeCropDialog").addEventListener("click",()=>$("cropDialog").close());
$("cancelCropButton").addEventListener("click",()=>$("cropDialog").close());
$("applyCropButton").addEventListener("click",async()=>{
  if(!cropStart||!cropEnd||!cropSource)return;
  const view=$("cropCanvas");
  const ratioX=cropSource.width/view.width,ratioY=cropSource.height/view.height;
  const x=Math.floor(Math.min(cropStart.x,cropEnd.x)*ratioX);
  const y=Math.floor(Math.min(cropStart.y,cropEnd.y)*ratioY);
  const w=Math.max(1,Math.floor(Math.abs(cropEnd.x-cropStart.x)*ratioX));
  const h=Math.max(1,Math.floor(Math.abs(cropEnd.y-cropStart.y)*ratioY));
  const crop=document.createElement("canvas");crop.width=w;crop.height=h;
  crop.getContext("2d").drawImage(cropSource,x,y,w,h,0,0,w,h);
  try{
    const blob=await new Promise((resolve,reject)=>crop.toBlob(b=>b?resolve(b):reject(Error("Crop conversion failed.")),"image/png"));
    $("cropDialog").close();
    imageAngle=0;cropSource=null;
    await scanImage(new File([blob],"cropped-business-card.png",{type:"image/png"}));
  }catch(err){notice(err.message||"Could not crop the photo.");}
});
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
