export function splitText(text: string, limit = 3500): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const head = rest.slice(0, limit);
    const boundary = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('\n'), head.lastIndexOf(' '));
    let end = boundary > limit / 2 ? boundary + 1 : limit;
    const code = rest.charCodeAt(end - 1);
    if (code >= 0xD800 && code <= 0xDBFF) end--;
    parts.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) parts.push(rest);
  return parts;
}

export function splitForSpeech(text:string,limit=220):string[]{
 const sentences=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('fr',{granularity:'sentence'}).segment(text)].map(s=>s.segment):text.split(/(?<=[.!?…])\s+/u);
 return sentences.flatMap(sentence=>splitText(sentence,limit)).map(s=>s.trim()).filter(Boolean);
}
