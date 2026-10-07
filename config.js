// Keep the same project and browser session as RNDM Chat v28.
// This is a public browser key. Never place a service_role/secret key here.
window.RNDM_CONFIG = Object.freeze({
  url: 'https://rijqlmrcnshswtoweoai.supabase.co',
  key: 'sb_publishable_Ay6EBRfZx1-Shj1FdMg7ZQ_P61Rii2A',
  version: '34.0.0',
  // Server-side role checks are enabled. UI writes remain additionally role-gated.
  adminWriteEnabled: true,
  // For difficult/mobile networks, add your TURN URLs + temporary browser credentials here.
  iceServers: [{urls:['stun:stun.l.google.com:19302','stun:stun.cloudflare.com:3478']}],
  maxFileBytes: 50 * 1024 * 1024
});
