// POSTs an approved voice order to RUNDEY's order intake. With no
// RUNDEY_INTAKE_URL configured (dev/test) it runs in stub mode: logs the
// payload and returns a fake id, recording that the stub path was used.
import { config } from '../config.js';

export async function submitToRundey(order) {
  const payload = {
    source: 'voice_bridge',
    voice_order_id: order.id,
    customer_phone: order.customer_phone,
    items: order.items,
  };

  if (!config.rundeyIntakeUrl) {
    console.log('[rundey-intake][stub]', JSON.stringify(payload));
    return { rundeyOrderId: `stub-${order.id.slice(0, 8)}`, mode: 'stub' };
  }

  const res = await fetch(config.rundeyIntakeUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.rundeyIntakeToken ? { Authorization: `Bearer ${config.rundeyIntakeToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`RUNDEY intake failed: HTTP ${res.status}`);
  const data = await res.json();
  return { rundeyOrderId: String(data.id ?? data.order_id ?? ''), mode: 'live' };
}
