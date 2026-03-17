// Simple automated messenger simulator
// Usage: node scripts/messenger_simulate.js super@gmail.com admin@gmail.com

const BASE = 'http://localhost:3000/messages';
const [,, me, target] = process.argv;
if (!me || !target) {
  console.error('Usage: node scripts/messenger_simulate.js <meEmail> <targetEmail>');
  process.exit(1);
}

async function api(path, options) {
  const res = await fetch(BASE + path, options);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch(e) { return txt; }
}

(async function(){
  console.log('Setting presence -> online');
  await api('/presence', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: me, online: true }) });

  console.log('Fetching contacts...');
  const contactsResp = await api('/contacts?me=' + encodeURIComponent(me));
  if (!contactsResp || !contactsResp.data) { console.error('Failed to load contacts', contactsResp); return; }
  console.log('Contacts count:', contactsResp.data.length);

  const query = 'admin';
  console.log(`Simulating search for "${query}"`);
  const match = contactsResp.data.find(c => (c.fullname||c.email).toLowerCase().includes(query));
  if (!match) { console.log('No match found for search'); return; }
  console.log('Found contact:', match.email);

  console.log('Fetching conversation with', match.email);
  let conv = await api('/conversation/' + encodeURIComponent(match.email) + '?me=' + encodeURIComponent(me));
  console.log('Messages before send:', (conv.data || []).length);

  const text = 'Automated message from script at ' + new Date().toISOString();
  console.log('Sending message:', text);
  const send = await api('/send', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ fromEmail: me, toEmail: match.email, text }) });
  console.log('Send response:', send && send.success);

  conv = await api('/conversation/' + encodeURIComponent(match.email) + '?me=' + encodeURIComponent(me));
  console.log('Messages after send:', (conv.data || []).length);
  console.log('Last message:', (conv.data && conv.data[conv.data.length-1]) || null);

  console.log('Setting presence -> offline');
  await api('/presence', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: me, online: false }) });
})();
