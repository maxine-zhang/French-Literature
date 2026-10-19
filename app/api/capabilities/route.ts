import {cloudConfigured} from '../../lib/cloud';
import {speechConfig} from '../../lib/access';
export function GET() {
  const protectedAccess = process.env.NODE_ENV !== 'production' || Boolean(process.env.APP_PASSWORD);
  return Response.json({translation: protectedAccess && Boolean(process.env.AI_API_KEY), cloud: protectedAccess && cloudConfigured(), speech: protectedAccess && Boolean(speechConfig().key)}, {headers: {'Cache-Control': 'no-store'}});
}
