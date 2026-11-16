/** Process-local research feed health. Exhaustion is terminal for this run; reconnects cannot silently clear it. */
export class ResearchFeedHealth {
 private exhausted=false;
 private connected=false;
 private lastReceipt:number|undefined;
 ready(){if(!this.exhausted)this.connected=true;}
 receipt(now:number){if(Number.isFinite(now)&&now>=0)this.lastReceipt=now;}
 disconnected(){this.connected=false;}
 fail(error:Error){if(error.message.includes("reconnect budget exhausted")){this.exhausted=true;this.connected=false;}}
 snapshot(now:number){return{status:this.exhausted?"failed"as const:!this.connected?"unavailable"as const:this.lastReceipt===undefined||now-this.lastReceipt>30000?"unknown"as const:"healthy"as const,exhausted:this.exhausted,lastReceiptAgeMs:this.lastReceipt===undefined?null:Math.max(0,now-this.lastReceipt),allowNewPaperWork:this.connected&&!this.exhausted&&this.lastReceipt!==undefined&&now>=this.lastReceipt&&now-this.lastReceipt<=30000};}
}
