'use client';
import {useEffect, useRef, useState} from 'react';
import {translationEntries} from './readingSegments';
import {splitText} from './text';

type Book = {id: string; chapter?:number; position?:number; chapters: {paragraphs: string[]}[]};
export function useBookTranslation(book: Book, lang: string, enabled: boolean, translations: Record<string, string>, onTranslation: (key: string, value: string) => void) {
  const cache = useRef(translations), callback = useRef(onTranslation);
  cache.current = translations; callback.current = onTranslation;
  const [retry, setRetry] = useState(0), [paused, setPaused] = useState(false);
  const [status, setStatus] = useState({done: 0, total: 0, error: '', running: false});
  useEffect(() => {
    const controller = new AbortController();
    const entries = translationEntries(book,lang,cache.current).sort((a,b)=>Number(b.chapter===book.chapter)-Number(a.chapter===book.chapter)||Number(b.paragraph===(book.position||0))-Number(a.paragraph===(book.position||0)));
    let done = entries.filter(e => Boolean(cache.current[e.key]||e.existing)).length;
    setStatus({done, total: entries.length, error: '', running: enabled && !paused && done < entries.length});
    if (!enabled || paused) return () => controller.abort();
    (async () => {
      try {
        for (const entry of entries) {
          if (controller.signal.aborted) return;
          if (cache.current[entry.key]) continue;
          if(entry.existing){cache.current={...cache.current,[entry.key]:entry.existing};callback.current(entry.key,entry.existing);continue;}
          const translated: string[] = [];
          for (const chunk of splitText(entry.text, 6000)) {
            const response = await fetch('/api/study', {method: 'POST', signal: controller.signal,
              headers: {'Content-Type': 'application/json'}, body: JSON.stringify({task: 'translate', text: chunk, lang})});
            const data = await response.json();
            if (!response.ok || typeof data.text !== 'string' || !data.text.trim()) throw Error(data.error || '翻译未返回内容，请重试。');
            translated.push(data.text);
          }
          if (controller.signal.aborted) return;
          const value = translated.join('\n');
          cache.current = {...cache.current, [entry.key]: value};
          callback.current(entry.key, value);
          setStatus({done: ++done, total: entries.length, error: '', running: done < entries.length});
        }
      } catch (error) {
        if (!controller.signal.aborted) setStatus({done, total: entries.length, error: error instanceof Error ? error.message : '翻译失败。', running: false});
      }
    })();
    return () => controller.abort();
  }, [book.id, book.chapters, book.chapter, lang, enabled, paused, retry]);
  return {...status, paused, togglePause: () => setPaused(v => !v), retry: () => setRetry(v => v + 1)};
}
