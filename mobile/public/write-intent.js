export async function payloadFingerprint(payload) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function chooseIntent(previous, fingerprint, makeId = () => crypto.randomUUID()) {
  if (previous && previous.fingerprint !== fingerprint) {
    throw new Error('앞선 저장 결과를 먼저 확인해 주세요. 설정의 저장 결과 확인을 눌러 주세요.');
  }
  return previous || { id: makeId(), fingerprint };
}

export async function existingPushSubscription(nav = navigator) {
  if (!nav.serviceWorker) return null;
  const registration = await nav.serviceWorker.getRegistration();
  return registration?.pushManager ? registration.pushManager.getSubscription() : null;
}
