export interface RetryAuthority {
 purpose:'offline-quarantine-retry';walSha256:string;planSha256:string;
 authorizedBy:string;issuedAt:number;expiresAt:number;liveAuthorized:false;
}
/** Local operator authorization artifact, not proof of a person's independent identity. */
export function validateRetryAuthority(value:RetryAuthority|undefined,walSha256:string,planSha256:string,reviewers:string[],now=Date.now()){
 if(!value||value.purpose!=='offline-quarantine-retry'||value.liveAuthorized!==false||value.walSha256!==walSha256||value.planSha256!==planSha256||!/^[a-f0-9]{64}$/.test(walSha256)||!/^[a-f0-9]{64}$/.test(planSha256)||!/^[a-zA-Z0-9._-]{1,80}$/.test(value.authorizedBy)||reviewers.includes(value.authorizedBy)||!Number.isSafeInteger(value.issuedAt)||!Number.isSafeInteger(value.expiresAt)||value.issuedAt>now||value.expiresAt<=now||value.expiresAt-value.issuedAt>3600000)throw Error('Explicit current WAL/plan-bound retry authority required');
 return value;
}
