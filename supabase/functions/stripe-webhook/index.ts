import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPABASE_URL     = 'https://eqnacealnnmpipapdguc.supabase.co';
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? '';
const WEBHOOK_SECRET   = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

Deno.serve(async (req) => {
  console.log('SERVICE_ROLE_KEY exists:', !!SERVICE_ROLE_KEY);
  
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature!, WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Webhook Error', { status: 400 });
  }

  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    await updateFeeStatus(customerId, 'paid');
  }

  if (event.type === 'customer.subscription.deleted' ||
      event.type === 'invoice.payment_failed') {
    const obj = event.data.object as any;
    const customerId = obj.customer as string;
    await updateFeeStatus(customerId, 'unpaid');
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function updateFeeStatus(customerId: string, status: string) {
  console.log(`Updating fee_status for ${customerId} → ${status}`);
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/members?stripe_id=eq.${customerId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ fee_status: status }),
    }
  );
  if (!res.ok) console.error('Supabase update failed:', await res.text());
  else console.log(`fee_status → ${status} for ${customerId}`);
}