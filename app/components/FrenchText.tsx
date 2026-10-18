'use client';
import {useEffect, useId, useRef, useState} from 'react';

const cache = new Map<string, string>();
export default function FrenchText({text, onSelect, onSpeak, onSave}: {text: string; onSelect: (word: string) => void; onSpeak: (word: string) => void; onSave: (word: string, meaning: string) => void}) {
  const id = useId();
  const [popup, setPopup] = useState<{word: string; value: string; error: boolean; left: number; top: number} | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  function close() { if (timer.current) clearTimeout(timer.current); request.current?.abort(); setPopup(null); }
  useEffect(() => { const hide = () => close(); window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide); return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); close(); }; }, [text]);
  function lookup(word: string, element: HTMLElement) {
    close();
    const rect = element.getBoundingClientRect();
    const position = {left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)), top: rect.bottom + 8 > window.innerHeight - 240 ? Math.max(12, rect.top - 240) : rect.bottom + 8};
    timer.current = setTimeout(async () => {
      const key = JSON.stringify([word.toLocaleLowerCase('fr'), text]);
      if (cache.has(key)) {setPopup({word, value: cache.get(key)!, error: false, ...position}); return;}
      const controller = new AbortController(); request.current = controller;
      setPopup({word, value: '正在查询上下文释义…', error: false, ...position});
      try {
        const offset = text.indexOf(word), start = Math.max(0, offset - 2000);
        const response = await fetch('/api/study', {method: 'POST', signal: controller.signal, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({task: 'word', text: word, context: text.slice(start, start + 5000)})});
        const data = await response.json();
        if (!response.ok || !data.text) throw Error(data.error || '查询失败，请重试。');
        if (controller.signal.aborted) return;
        if (cache.size >= 500) cache.delete(cache.keys().next().value!);
        cache.set(key, data.text);
        setPopup({word, value: data.text, error: false, ...position});
      } catch (error) {if (!controller.signal.aborted) setPopup({word, value: error instanceof Error ? error.message : '查询失败。', error: true, ...position});}
    }, 400);
  }
  const tokens = text.split(/([\p{L}\p{M}]+(?:[’'\-][\p{L}\p{M}]+)*)/u);
  return <span className="french-text" onBlur={e => {if (!e.currentTarget.contains(e.relatedTarget)) close();}} onMouseLeave={() => {if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(close, 180);}} onKeyDown={e => {if (e.key === 'Escape') close();}}>
    {tokens.map((word, index) => index % 2 ? <span key={index} className="word-token" tabIndex={0} role="button" aria-label={`查询 ${word}`} aria-describedby={popup?.word === word ? id : undefined}
      onMouseEnter={e => lookup(word, e.currentTarget)} onFocus={e => lookup(word, e.currentTarget)}
      onBlur={e => {if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) close();}}
      onKeyDown={e => {if (e.key === 'Enter' || e.key === ' ') {e.preventDefault(); onSelect(word); lookup(word, e.currentTarget);}}}
      onClick={e => {onSelect(word); lookup(word, e.currentTarget);}}>{word}</span> : word)}
    {popup && <span id={id} role="dialog" aria-label={`${popup.word} 的释义`} className="word-popup" style={{left: popup.left, top: popup.top}}
      onMouseEnter={() => {if (timer.current) clearTimeout(timer.current);}} onClick={e => e.stopPropagation()}>
      <strong lang="fr">{popup.word}</strong><button className="popup-close" aria-label="关闭释义" onClick={close}>×</button>
      <span className={popup.error ? 'lookup-error' : ''} role="status">{popup.value}</span>
      <span className="popup-actions"><button onClick={() => onSpeak(popup.word)}>听发音</button>{!popup.error && popup.value !== '正在查询上下文释义…' && <button onClick={() => onSave(popup.word, popup.value)}>加入生词本</button>}</span>
    </span>}
  </span>;
}
