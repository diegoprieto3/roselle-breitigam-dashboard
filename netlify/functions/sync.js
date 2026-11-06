const VAPI_API_KEY = process.env.VAPI_API_KEY;
const ASSISTANT_ID = 'bc555463-d8ab-4af4-a9ab-f62d6a65e668';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
function sbHeaders(prefer) {
  const h = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (prefer) h.Prefer = prefer;
  if (SUPABASE_KEY && !String(SUPABASE_KEY).startsWith('sb_secret_')) h.Authorization = `Bearer ${SUPABASE_KEY}`;
  return h;
}

exports.handler = async function(event, context) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'supabase not configured' }) };

try {
    const res = await fetch(`https://api.vapi.ai/call?limit=100&assistantId=${ASSISTANT_ID}`, {
      headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
    });
    if (!res.ok) throw new Error('Vapi fetch failed: ' + res.status);
    const data = await res.json();
    const calls = Array.isArray(data) ? data : (data.results || data.calls || []);

    for (const c of calls) {
      const detailRes = await fetch(`https://api.vapi.ai/call/${c.id}`, {
        headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` }
      });
      const detail = detailRes.ok ? await detailRes.json() : c;

      const msgs = detail.artifact?.messages || detail.messages || [];
      const transcript = detail.artifact?.transcript || '';

      // Extract caller name
      let callerName = null;
      if (Array.isArray(msgs)) {
        for (let i = 0; i < msgs.length - 1; i++) {
          const m = msgs[i];
          if ((m.role === 'bot' || m.role === 'assistant') &&
              (m.message || '').toLowerCase().includes('full name')) {
            const nextUser = msgs.slice(i + 1).find(u => u.role === 'user');
            if (nextUser) {
              const raw = (nextUser.message || '').trim();
              const cleaned = raw
                .replace(/^(yes|yeah|yep|sure|okay|ok)[.,]?\s*/i, '')
                .replace(/^(it'?s|my name is|this is|i'?m)\s*/i, '')
                .replace(/\.$/, '').trim();
              const words = cleaned.split(/\s+/);
              if (words.length >= 1 && words.length <= 4 && !/[,?!]/.test(cleaned)) {
                callerName = cleaned;
              }
            }
            break;
          }
        }
      }

      // Extract call reason
      let callReason = null;
      if (Array.isArray(msgs)) {
        for (let i = 0; i < msgs.length - 1; i++) {
          const m = msgs[i];
          if ((m.role === 'bot' || m.role === 'assistant') &&
              ((m.message || '').toLowerCase().includes('reason for your call') ||
               (m.message || '').toLowerCase().includes('how can i help') ||
               (m.message || '').toLowerCase().includes('what can i help'))) {
            const nextUser = msgs.slice(i + 1).find(u => u.role === 'user');
            if (nextUser) callReason = (nextUser.message || '').trim();
            break;
          }
        }
      }

      // Duration
      let dur = detail.duration || detail.durationSeconds || 0;
      if (!dur && detail.startedAt && detail.endedAt) {
        dur = Math.round((new Date(detail.endedAt) - new Date(detail.startedAt)) / 1000);
      }

      const record = {
        id: detail.id,
        assistant_id: detail.assistantId || ASSISTANT_ID,
        caller_number: detail.customer?.number || detail.phoneNumber || null,
        caller_name: callerName,
        duration: Math.round(dur),
        started_at: detail.startedAt || detail.createdAt || null,
        ended_at: detail.endedAt || null,
        recording_url: detail.artifact?.recordingUrl || detail.recordingUrl || null,
        summary: detail.artifact?.summary || detail.summary || null,
        end_reason: detail.endedReason || detail.status || null,
        transcript: typeof transcript === 'string' ? transcript : JSON.stringify(msgs),
        call_reason: callReason
      };

      await fetch(`${SUPABASE_URL}/rest/v1/calls`, {
        method: 'POST',
        headers: sbHeaders('resolution=merge-duplicates'),
        body: JSON.stringify(record)
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, synced: calls.length })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
const {withAuth} = require('./_auth');
exports.handler = withAuth(exports.handler);
