export function requireAccess(req: Request): Response | null {
  const password = process.env.APP_PASSWORD;
  if (process.env.NODE_ENV === 'production' && !password) {
    return Response.json({error: '请先在服务端设置 APP_PASSWORD。'}, {status: 503});
  }
  if (password) {
    try {
      const auth = req.headers.get('authorization');
      if (auth?.startsWith('Basic ')) {
        const value = atob(auth.slice(6));
        if (value.slice(value.indexOf(':') + 1) === password) return null;
      }
    } catch {}
    return Response.json({error: '需要访问密码。'}, {status: 401});
  }
  return null;
}

export function speechConfig() {
  const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  return {
    key: process.env.TTS_API_KEY || (base === 'https://api.openai.com/v1' ? process.env.AI_API_KEY : undefined),
    model: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
    voice: process.env.TTS_VOICE || 'marin',
  };
}
