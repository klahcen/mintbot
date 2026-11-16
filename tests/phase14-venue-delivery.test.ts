import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import { VenueFeedHealth } from '../src/research/venue-feed-health.js';
import { researchCoverage } from '../src/research/coverage.js';
const signature = bs58.encode(Buffer.alloc(64, 3));
test('Selective delivery cannot hide a silent acknowledged venue behind busy traffic', () => {
  const health = new VenueFeedHealth(['pump', 'meteora-dlmm'], 30);
  health.acknowledged(1); health.receipt('pump', signature, 32);
  const rows = health.snapshot(33, true);
  assert.equal(rows.pump!.status, 'verified');
  assert.equal(rows['meteora-dlmm']!.status, 'degraded');
  assert.equal(researchCoverage({liveReady:true, requiredVenueDeliveryReady:Object.values(rows).every(v=>v.allowDelivery)},
    {gaps:[],quarantined:0}).status,'unknown');
});
test('Zero and missing identities count as delivered but cannot establish valid delivery', () => {
  const health = new VenueFeedHealth(['meteora-dlmm'], 30);
  health.acknowledged(1);
  health.receipt('meteora-dlmm', '1'.repeat(64), 2);
  health.receipt('meteora-dlmm', undefined, 3);
  let row=health.snapshot(4,true)['meteora-dlmm']!;
  assert.equal(row.notifications,2); assert.equal(row.invalidIdentityRate,1); assert.equal(row.allowDelivery,false);
  health.receipt('meteora-dlmm',signature,5);
  row=health.snapshot(6,true)['meteora-dlmm']!;
  assert.equal(row.invalidIdentityRate,2/3); assert.equal(row.allowDelivery,true);
  assert.equal(health.snapshot(36,true)['meteora-dlmm']!.allowDelivery,false);
});
test('Reconnect, disconnection and backward clocks cannot reuse old delivery proof', () => {
  const health=new VenueFeedHealth(['raydium-cpmm']);
  health.acknowledged(10); health.receipt('raydium-cpmm',signature,11);
  assert.equal(health.snapshot(9,true)['raydium-cpmm']!.allowDelivery,false);
  assert.equal(health.snapshot(12,false)['raydium-cpmm']!.status,'unhealthy');
  health.reset(); health.acknowledged(13);
  assert.equal(health.snapshot(14,true)['raydium-cpmm']!.allowDelivery,false);
  assert.equal(health.snapshot(14,true)['raydium-cpmm']!.notifications,1);
});

test('Supervisor exposes selective delivery to the actual coverage gate', async () => {
  const { EventEmitter } = await import('node:events');
  const { MonitorSupervisor } = await import('../src/research/monitor-supervisor.js');
  const { VERIFIED_PROGRAMS } = await import('../src/chain.js');
  class Socket extends EventEmitter { send() {} close() {} terminate() {} }
  const socket = new Socket(); let now=0;
  const monitor=new MonitorSupervisor(['wss://fixture.invalid'],VERIFIED_PROGRAMS.slice(0,2),()=>{},
    {clock:()=>now,wallClock:()=>now,socketFactory:()=>socket,
      scheduler:{schedule:()=>0,cancel:()=>{}},receiptStaleMs:30});
  monitor.start();socket.emit('open');
  for(const [id,result] of [[1,9],[2,10]])socket.emit('message',JSON.stringify({jsonrpc:'2.0',id,result}));
  const receipt=(subscription:number)=>socket.emit('message',JSON.stringify({jsonrpc:'2.0',method:'logsNotification',
    params:{subscription,result:{context:{slot:1},value:{signature,logs:[],err:null}}}}));
  now=1;receipt(9);
  assert.equal(monitor.snapshot().liveReady,true);
  assert.equal(monitor.snapshot().requiredVenueDeliveryReady,false);
  assert.equal(researchCoverage(monitor.snapshot(),{gaps:[],quarantined:0}).status,'unknown');
  receipt(10);assert.equal(monitor.snapshot().requiredVenueDeliveryReady,true);
  now=32;receipt(9); // Existing aggregate discontinuity watchdog refuses a receipt after a gap.
  assert.equal(monitor.snapshot().requiredVenueDeliveryReady,false);
  monitor.stop();
});

test('Missing signature envelopes retain venue/subscription provenance without normalization', async () => {
  const { EventEmitter }=await import('node:events');
  const { SolanaMonitor, VERIFIED_PROGRAMS }=await import('../src/chain.js');
  const traces: import('../src/research/wire-identity.js').WireIdentityTrace[]=[];
  class Socket extends EventEmitter {send(){} close(){}}
  const socket=new Socket();let observations=0;
  const monitor=new SolanaMonitor('wss://fixture.invalid',VERIFIED_PROGRAMS.slice(0,1),()=>observations++,
    {strictRpcNotifications:true,maxReconnects:0,onError:()=>{},onIdentityTrace:t=>traces.push(t)},()=>socket);
  monitor.start();socket.emit('open');socket.emit('message',JSON.stringify({jsonrpc:'2.0',id:1,result:9}));
  socket.emit('message',JSON.stringify({jsonrpc:'2.0',method:'logsNotification',params:{subscription:9,
    result:{context:{slot:12},value:{logs:[],err:null}}}}));
  assert.equal(observations,0);assert.equal(traces[0]!.envelopeIssue,'malformed-logs-notification');
  assert.equal(traces[0]!.program,'pump');assert.equal(traces[0]!.subscription,9);
  assert.equal(traces[0]!.extractedSignature,undefined);monitor.stop();
});
