'use client';
import {useEffect, useRef, useState} from 'react';
import {splitText} from './text';

export function useFrenchSpeech({engine, speed, voiceName, paragraphs, repeat, onError}: {
  engine: string; speed: number; voiceName: string; paragraphs: string[]; repeat: {current: boolean}; onError: (message: string) => void;
}) {
  const [playing, setPlaying] = useState(-1), [loading, setLoading] = useState(false), [paused, setPaused] = useState(false);
  const controller = useRef<AbortController | null>(null), audio = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, Blob>());
  const latestSpeed = useRef(speed); latestSpeed.current = speed;
  function stop() {
    controller.current?.abort(); controller.current = null;
    audio.current?.pause(); audio.current = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    setPlaying(-1); setLoading(false); setPaused(false);
  }
  useEffect(() => () => {controller.current?.abort(); audio.current?.pause(); if ('speechSynthesis' in window) speechSynthesis.cancel();}, []);
  useEffect(() => {if (audio.current) audio.current.playbackRate = speed;}, [speed]);
  async function speak(text: string, index = -1, continuous = false) {
    stop();
    const job = new AbortController(); controller.current = job;
    const signal = job.signal;
    try {
      let current = text, position = index;
      do {
        if (signal.aborted) return;
        setPlaying(position);
        for (const chunk of splitText(current)) {
          if (signal.aborted) return;
          if (engine === 'device') {
            if (!('speechSynthesis' in window)) throw Error('此浏览器不支持设备朗读，请使用云端语音。');
            const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('fr'));
            const voice = voices.find(v => v.name === voiceName) || voices.find(v => v.lang.toLowerCase() === 'fr-fr') || voices[0];
            if (!voice) throw Error('设备没有法语声音，请安装法语语音或使用云端朗读。');
            await new Promise<void>((resolve, reject) => {
              const utterance = new SpeechSynthesisUtterance(chunk);
              utterance.lang = 'fr-FR'; utterance.voice = voice; utterance.rate = latestSpeed.current;
              const abort = () => {speechSynthesis.cancel(); reject(Error('aborted'));};
              signal.addEventListener('abort', abort, {once: true});
              utterance.onend = () => {signal.removeEventListener('abort', abort); resolve();};
              utterance.onerror = () => {signal.removeEventListener('abort', abort); reject(Error('设备法语朗读失败。'));};
              speechSynthesis.speak(utterance);
            });
          } else {
            let blob = cache.current.get(chunk);
            if (!blob) {
              setLoading(true);
              const response = await fetch('/api/speech', {method: 'POST', signal, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: chunk})});
              if (!response.ok) {const data = await response.json(); throw Error(data.error || '云端朗读失败。');}
              if (!response.headers.get('content-type')?.startsWith('audio/')) throw Error('语音服务未返回有效音频。');
              blob = await response.blob();
              if (signal.aborted) return;
              if (cache.current.size >= 32) cache.current.delete(cache.current.keys().next().value!);
              cache.current.set(chunk, blob);
            }
            setLoading(false);
            const url = URL.createObjectURL(blob), player = new Audio(url); audio.current = player;
            player.playbackRate = latestSpeed.current;
            try {
              await new Promise<void>((resolve, reject) => {
                const abort = () => {player.pause(); reject(Error('aborted'));};
                signal.addEventListener('abort', abort, {once: true});
                const finish = (error?: Error) => {signal.removeEventListener('abort', abort); error ? reject(error) : resolve();};
                player.onended = () => finish(); player.onerror = () => finish(Error('音频播放失败。'));
                player.play().catch(() => finish(Error('浏览器阻止了音频，请再次点击播放。')));
              });
            } finally {player.pause(); URL.revokeObjectURL(url); if (audio.current === player) audio.current = null;}
          }
        }
        if (continuous && position + 1 < paragraphs.length) {position++; current = paragraphs[position];}
        else if (!continuous && repeat.current) {continue;}
        else break;
      } while (!signal.aborted);
    } catch (error) {if (!signal.aborted) onError(error instanceof Error ? error.message : '朗读失败。');}
    finally {if (controller.current === job) {setPlaying(-1); setLoading(false); setPaused(false); controller.current = null;}}
  }
  function togglePause() {
    if (!controller.current || loading) return;
    if (audio.current) {
      if (audio.current.paused) {audio.current.play().then(() => setPaused(false)).catch(() => onError('无法继续播放，请重新开始。'));}
      else {audio.current.pause(); setPaused(true);}
    } else if ('speechSynthesis' in window) {
      if (speechSynthesis.paused) {speechSynthesis.resume(); setPaused(false);} else {speechSynthesis.pause(); setPaused(true);}
    }
  }
  return {speak, stop, playing, loading, paused, togglePause};
}
