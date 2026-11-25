(function(root){
"use strict";
const FIELDS={firstName:"",lastName:"",company:"",title:"",phone:"",phone2:"",email:"",website:"",address:""};
const emailRx=/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i;
const webRx=/(?:https?:\/\/)?(?:www\.)[\w.\-]+\.[a-z]{2,}(?:\/[^\s]*)?/i;
const roleRx=/(?:\b(?:CEO|CFO|COO|CTO|director|manager|engineer|specialist|sales|marketing|gallery|coordinator|executive|consultant|assistant|founder|owner|administrator|accountant)\b|müdür(?:ü)?|yönetici|başkan|mühendis|satış|sorumlusu|reprezentant|responsabil|asistent|comercial)/iu;
const organizationRx=/(?:\b(?:s\.?\s*r\.?\s*l\.?|s\.?\s*a\.?|ltd\.?|limited|llc|inc\.?|gmbh|corp\.?)\b|\b(?:travel|tours|turizm|tourism|hotel|group|logistics|rentals|rental|agency|cookware|holdings|consulting|kitchenware|automotive)\b|a\.ş\.)/iu;
const addressRx=/(?:\b(?:strada|street|str\.|blvd|bulevard(?:ul)?|bd\.|avenue|road|sector|postal|postcode|via|viale|piazza|corso|sokak|sok\.|cadde|caddesi|mahallesi|mah\.|no\.)\b|bulvarı|bulvar|organize sanayi|bölgesi|başakşehir|ikitelli)/iu;
const cityCountryRx=/(?:\b(?:istanbul|rome|roma|bucureşti|bucurești|bucuresti|ankara|turkiye|türkiye|romania|italia|italy|românia|köy|sector)\b|İstanbul)/iu;
const clean=s=>String(s||"").replace(/[\t\u00a0]+/g," ").replace(/[ \u200b]{2,}/g," ").trim();
function phoneNumbers(line){
  if(/fax/i.test(line))return[];
  const pattern=/(?:\+|00)?\d[\d()\s./-]{6,}\d/g;
  return (line.match(pattern)||[]).map(p=>p.trim().replace(/[;,.:]+$/,"")).filter(p=>{
    const d=p.replace(/\D/g,"");
    if(d.length<8||d.length>15)return false;
    if(/\b(?:postcode|postal|zip|address)\b/i.test(line))return false;
    return /^\+|^00/.test(p)||/\b(?:tel|phone|mobile|mobil|gsm|cell)\b/i.test(line)||d.length>=10;
  });
}
function nameCandidate(line){
  if(!line||line.includes("@")||/(?:https?:|www\.|email|e-mail|phone|mobile|mobil|tel|gsm|fax|address)/i.test(line))return false;
  if(addressRx.test(line)||cityCountryRx.test(line)||roleRx.test(line)||organizationRx.test(line))return false;
  if(line.replace(/\D/g,"").length>1)return false;
  const words=line.replace(/^(?:mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i,"").split(/\s+/);
  return words.length>=2&&words.length<=4&&words.every(w=>/^[\p{Lu}][\p{L}'’-]*$/u.test(w));
}
function formatDomain(mail){return mail.includes("@")?mail.split("@").pop().toLowerCase():"";}
function editDistance(a,b){
  if(Math.abs(a.length-b.length)>2)return 9;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const next=[i];
    for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=next;
  }
  return prev[b.length];
}
function parseCard(raw){
  const fields={...FIELDS},warnings=[];
  const source=String(raw||"");
  // cap parser work; if OCR goes wild, don't create hundreds of assignments
  const lines=source.split(/\r?\n/).map(clean).filter(Boolean).slice(0,120);
  const mail=source.match(emailRx);
  if(mail)fields.email=mail[0].replace(/[,;:.]+$/,"").toLowerCase();
  const website=source.match(webRx);
  if(website)fields.website=website[0].replace(/[,;:.]+$/,"");

  const phones=[],numbers=new Set();
  for(const line of lines){
    for(const number of phoneNumbers(line)){
      const key=number.replace(/\D/g,"");
      if(!numbers.has(key)){phones.push(number);numbers.add(key);}
    }
  }
  fields.phone=phones[0]||"";fields.phone2=phones[1]||"";

  const names=lines.map((s,i)=>nameCandidate(s)?i:-1).filter(i=>i>=0);
  // Prefer a name adjacent to a job title, otherwise a unique name-like line.
  const nearTitle=names.filter(i=>lines.slice(i+1,i+3).some(x=>roleRx.test(x)));
  const fullNameIdx=nearTitle.length===1?nearTitle[0]:names.length===1?names[0]:-1;
  if(fullNameIdx>=0){
    const words=lines[fullNameIdx].split(/\s+/);
    fields.firstName=words[0]||"";
    fields.lastName=words.slice(1).join(" ");
  }else if(names.length>1)warnings.push("Several possible names. Choose the correct one.");

  const titleIndex=lines.findIndex(line=>roleRx.test(line)&&!line.includes("@")&&!organizationRx.test(line)&&line.length<75);
  if(titleIndex>=0)fields.title=lines[titleIndex].replace(/^(?:title|position|role)\s*:\s*/i,"");

  // An organization can be identified from printed text, not guessed from a mail domain.
  const organizations=lines.filter(line=>organizationRx.test(line)&&!line.includes("@")&&!webRx.test(line)&&line.length<85&&!roleRx.test(line));
  if(organizations.length===1)fields.company=organizations[0].replace(/^[^A-Za-zÀ-žĞğŞşİıÖöÜüÇç]+/,"").trim();

  // Multiple address lines, usually at the bottom or on the card's right side.
  // Do not mix telephone/email into the address.
  const addrStart=lines.findIndex(line=>addressRx.test(line)&&!line.includes("@")&&phoneNumbers(line).length===0);
  if(addrStart>=0){
    const parts=[];
    for(let j=addrStart;j<Math.min(lines.length,addrStart+5);j++){
      const line=lines[j];
      if(line.includes("@")||webRx.test(line)||phoneNumbers(line).length||roleRx.test(line))break;
      if(j>addrStart && (nameCandidate(line)||organizationRx.test(line)))break;
      if(j>addrStart && line.length>95)break;
      const cleaned=line.replace(/^[^\p{L}\p{N}]+/u,"").trim();
      if(cleaned)parts.push(cleaned);
    }
    fields.address=parts.join(", ");
  }
  // Printed logo can be text-only. Treat company as unknown when only a domain exists.
  if(!fields.company){
    const possible=lines.filter(line=>organizationRx.test(line)&&!line.includes("@")&&!webRx.test(line)&&!roleRx.test(line)&&line.length<70);
    if(possible.length===1)fields.company=possible[0];
  }
  if(fields.email&&fields.website){
    const domain=formatDomain(fields.email);
    const textDomain=fields.website.replace(/^https?:\/\//i,"").replace(/^www\./i,"").split("/")[0].toLowerCase();
    if(domain!==textDomain && editDistance(domain,textDomain)<=2){
      fields.website="www."+domain;
      warnings.push("Website matched to email domain. Please verify.");
    }
  }
  if(!fields.firstName&&!fields.lastName)warnings.push("Name needs review.");
  if(!fields.company)warnings.push("Company is not printed or was not recognized.");
  if(!fields.phone)warnings.push("Phone number needs review.");
  const suggestions=lines.filter(line=>{
    if(line.length<3 || line.length>110)return false;
    if(!/[\p{L}\d]{2}/u.test(line))return false;
    const letters=(line.match(/\p{L}/gu)||[]).length;
    const digits=(line.match(/\d/g)||[]).length;
    const punctuation=(line.match(/[^\p{L}\d\s@.:/+(),&'-]/gu)||[]).length;
    return letters+digits>=3 && punctuation<=Math.max(4,Math.floor(line.length*.25));
  }).slice(0,14).map(text=>({text,field:""}));
  return {fields,warnings,lines:suggestions};
}
root.CardKeeperParser={parseCard,phoneNumbers};
if(typeof module!=="undefined"&&module.exports)module.exports=root.CardKeeperParser;
})(typeof globalThis!=="undefined"?globalThis:this);