exports.handler = async function(event, context) {
  const API_KEY = process.env.VAPI_API_KEY;
  const ASSISTANT_ID = 'bc555463-d8ab-4af4-a9ab-f62d6a65e668';
  const callId = event.queryStringParameters?.callId;

  try {
    let url = callId
      ? `https://api.vapi.ai/call/${callId}`
      : `https://api.vapi.ai/call?limit=20&assistantId=${ASSISTANT_ID}`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    if (!res.ok) throw new Error('Vapi error ' + res.status);
    const data = await res.json();
    if (callId && data.assistantId !== ASSISTANT_ID) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
const {withAuth} = require('./_auth');
exports.handler = withAuth(exports.handler);
