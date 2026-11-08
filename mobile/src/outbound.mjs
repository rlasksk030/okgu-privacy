import {AppError} from './core.mjs';

// Workers supports manual/follow, but not the Fetch standard's error mode.
// Keep credentials and push payloads on the originally selected destination.
export async function fetchNoRedirect(url,options={},timeout=12000){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(timeout),redirect:'manual'});
 if(response.status>=300&&response.status<400){
  const error=new AppError('연결 주소가 변경되어 요청을 중단했어요. 잠시 후 다시 시도해 주세요.',502);
  error.code='UPSTREAM_REDIRECT';throw error;
 }
 return response;
}
