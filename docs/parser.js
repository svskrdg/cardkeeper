(function(root) {
  "use strict";
  const EMPTY={firstName:"",lastName:"",company:"",title:"",phone:"",phone2:"",email:"",website:"",address:""};
  const EMAIL=/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi;
  const WEB=/(?:https?:\/\/)?(?:www\.)[\w.-]+\.[A-Z]{2,}(?:\/\S*)?/gi;
  const ROLE=/\b(?:CEO|CFO|COO|CTO|director|manager|coordinator|consultant|engineer|specialist|owner|founder|president|administrator|accountant|sales|marketing|agent|agent de turism|executive|assistant)\b|(?:müdür(?:ü)?|yönetici|başkan|mühendis|sorumlusu|asistent|reprezentant)/iu;
  const LEGAL=/(?:\b(?:s\.?\s*r\.?\s*l\.?|s\.?\s*a\.?|ltd\.?|limited|llc|inc\.?|gmbh|corp\.?|corporation|co\.?)\b|(?:a\.ş\.?|şirketi|ticaret))$/iu;
  const ORG_WORDS=/(?:travel|turizm|tourism|agency|hotel|hotels|holding|group|consulting|logistics|enterprise|tours|reizen|turist|transports)/iu;
  const ADDR=/(?:\b(?:strada|str\.|street|st\.|bulevard(?:ul)?|bd\.|blvd|avenue|road|sector|postcode|postal|sokak|sok\.|cadde|caddesi|mahallesi|no\.)\b|mahalle|bucurești|bucuresti)/iu;
  const PHONE_LABEL=/(?:\b(?:tel(?:efon)?|phone|mobile|mobil|gsm|cell|fax|t:|m:)\b)/iu;
  function cleanLine(s){return String(s).replace(/[\t\u00a0]+/g," ").replace(/[ \u200b]{2,}/g," ").trim();}
  function phoneNumbers(line){
    if(/fax/i.test(line)) return [];
    const m=line.match(/(?:(?:\+|00)\d{1,3}[ \-./()]*)?(?:\(?\d{2,5}\)?[ \-./()]*){2,5}\d{2,5}/g)||[];
    return m.map(p=>p.trim().replace(/[.,;:]+$/,"")).filter(p=>{
      const n=p.replace(/\D/g,"");
      if(n.length<8||n.length>15)return false;
      if(!p.startsWith("+")&&!p.startsWith("00")&&!PHONE_LABEL.test(line)&&n.length<10)return false;
      return true;
    });
  }
  function lineIsName(s) {
    if(!s||s.includes("@")||/\b(?:www\.|http|email|e-mail|mail|phone|mobile|mobil|tel|fax|gsm|address)\b/i.test(s))return false;
    if(ADDR.test(s)||ORG_WORDS.test(s)||ROLE.test(s)||LEGAL.test(s)||s.replace(/\D/g,"").length>1)return false;
    const words=s.replace(/^(?:mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i,"").split(/\s+/);
    return words.length>=2&&words.length<=4&&words.every(w=>/^[\p{Lu}][\p{L}'’.‐-]*$/u.test(w));
  }
  function parseCard(raw){
    const info={...EMPTY}, warnings=[], suggestions=[];
    const lines=String(raw||"").split(/\r?\n/).map(cleanLine).filter(Boolean);
    const emailMatches=[...String(raw||"").matchAll(EMAIL)].map(m=>m[0].replace(/[.,;:]+$/,""));
    info.email=(emailMatches[0]||"").toLowerCase();
    info.website=(String(raw||"").match(WEB)||[])[0]||"";
    const seen=new Set(), phoneCandidates=[];
    for(const line of lines){
      for(const number of phoneNumbers(line)){
        const key=number.replace(/\D/g,"");
        if(!seen.has(key)){seen.add(key);phoneCandidates.push(number);}
      }
      if(!info.address&&ADDR.test(line)&&/\d/.test(line)&&!line.includes("@")) info.address=line;
      if(!info.title&&ROLE.test(line)&&!line.includes("@")&&!ORG_WORDS.test(line)&&line.length<85)info.title=line.replace(/^(?:title|position|role)\s*:\s*/i,"");
      if(!info.company&&LEGAL.test(line)&&!line.includes("@")&&line.length<85)info.company=line;
    }
    info.phone=phoneCandidates[0]||"";info.phone2=phoneCandidates[1]||"";
    const candidates=lines.filter(lineIsName);
    if(candidates.length===1) {
      const words=candidates[0].replace(/^(?:mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i,"").split(/\s+/);
      info.firstName=words[0]||"";
      info.lastName=words.slice(1).join(" ");
    } else if(candidates.length>1){
      // Two plausible names is ambiguous: do not silently choose the first.
      warnings.push("Several possible names. Please select the correct line below.");
    }
    if(!info.company){
      const possible=lines.filter(s=>ORG_WORDS.test(s)&&!s.includes("@")&&s.length<65);
      if(possible.length===1&&!ROLE.test(possible[0]))info.company=possible[0];
    }
    if(!info.firstName&&!info.lastName)warnings.push("Name needs review.");
    if(!info.company)warnings.push("Company needs review.");
    if(!info.phone)warnings.push("Phone number needs review.");
    if(/[�ÃÂ][^\s]?/.test(raw))warnings.push("Some characters may be misread. Compare with the card photo.");
    for(const line of lines){
      let field="";
      if(line.includes(info.email)&&info.email)field="email";
      else if(line===info.title)field="title";
      else if(line===info.company)field="company";
      else if(line===info.address)field="address";
      else if(lineIsName(line)&&candidates.length===1)field="firstName";
      else if(phoneNumbers(line).length)field="phone";
      suggestions.push({text:line,field});
    }
    return {fields:info,lines:suggestions,warnings};
  }
  root.CardKeeperParser={parseCard,phoneNumbers};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.CardKeeperParser;
})(typeof globalThis!=="undefined"?globalThis:this);