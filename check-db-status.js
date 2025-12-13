const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://pvvbcvqnlygykipbecmr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatus() {
  const requestId = '4a2492c0-4ebc-41d8-bf8f-d602f3470eec';

  console.log('Querying request:', requestId);
  console.log('');

  const { data: request, error: requestError } = await supabase
    .from('service_requests')
    .select('id, title, status, created_at, final_outcome')
    .eq('id', requestId)
    .single();

  if (requestError) {
    console.error('Error fetching request:', requestError);
    return;
  }

  console.log('=== SERVICE REQUEST ===');
  console.log(JSON.stringify(request, null, 2));
  console.log('');

  const { data: providers, error: providersError } = await supabase
    .from('providers')
    .select('id, name, call_status, called_at')
    .eq('request_id', requestId);

  if (providersError) {
    console.error('Error fetching providers:', providersError);
    return;
  }

  console.log('=== PROVIDERS ===');
  console.log(`Total: ${providers.length}`);
  console.log('');

  const withStatus = providers.filter(p => p.call_status);
  const completed = providers.filter(p => ['completed', 'failed', 'error', 'timeout', 'no_answer', 'voicemail', 'busy'].includes(p.call_status));

  console.log(`With call_status: ${withStatus.length}/${providers.length}`);
  console.log(`Completed: ${completed.length}/${withStatus.length}`);
  console.log('');

  console.log('Provider statuses:');
  providers.forEach(p => {
    console.log(`  - ${p.name}: ${p.call_status || '(no status)'}`);
  });
}

checkStatus().catch(console.error);
