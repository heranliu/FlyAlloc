// Dates are ISO decision dates, not valuation dates. Never invent holiday frames.
export function findReplayIndex(frames,date){
 if(!frames.length||!/^\d{4}-\d{2}-\d{2}$/.test(date))return -1;
 let lo=0,hi=frames.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(frames[mid].decisionDate<date)lo=mid+1;else hi=mid;}
 return Math.min(lo,frames.length-1);
}
