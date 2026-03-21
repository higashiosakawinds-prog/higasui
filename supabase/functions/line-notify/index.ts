const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';

Deno.serve(async (req) => {
  // CORS対応（ブラウザからの呼び出し用）
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
      },
    });
  }

  try {
    const { message, type } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // LINE Broadcast API（全友達に送信）
    const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            type: 'text',
            text: message,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('LINE API error:', err);
      return new Response(JSON.stringify({ success: false, error: err }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    console.log(`LINE broadcast sent: ${type ?? 'manual'}`);
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (e) {
    console.error('Error:', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});