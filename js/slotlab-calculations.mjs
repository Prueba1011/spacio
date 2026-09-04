const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const round=(value,digits=1)=>Number(value.toFixed(digits));
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

export function usableRectangles(config){
  const width=config.roomWidth,depth=config.roomDepth,shape=config.shape||'rectangle';
  if(shape==='l-shape'){
    const cutWidth=clamp(config.cutWidth||width*.35,1,width-1),cutDepth=clamp(config.cutDepth||depth*.4,1,depth-1);
    return[
      {id:'main',x:0,z:cutDepth/2,width,depth:depth-cutDepth},
      {id:'leg',x:-cutWidth/2,z:-(depth-cutDepth)/2,width:width-cutWidth,depth:cutDepth}
    ];
  }
  if(shape==='connected'){
    const secondWidth=config.room2Width||5,secondDepth=config.room2Depth||5;
    return[
      {id:'area1',x:0,z:0,width,depth},
      {id:'area2',x:width/2+secondWidth/2,z:0,width:secondWidth,depth:secondDepth}
    ];
  }
  return[{id:'main',x:0,z:0,width,depth}];
}

export function buildRoutingModel({config,racks,origin,clearance=.12}){
  const rectangles=usableRectangles(config),minX=Math.min(...rectangles.map(rect=>rect.x-rect.width/2)),maxX=Math.max(...rectangles.map(rect=>rect.x+rect.width/2)),minZ=Math.min(...rectangles.map(rect=>rect.z-rect.depth/2)),maxZ=Math.max(...rectangles.map(rect=>rect.z+rect.depth/2)),extent=Math.max(maxX-minX,maxZ-minZ),step=clamp(extent/180,.25,.7),cols=Math.ceil((maxX-minX)/step)+1,rows=Math.ceil((maxZ-minZ)/step)+1,total=cols*rows,walkable=new Uint8Array(total),distance=new Float64Array(total),previous=new Int32Array(total);
  distance.fill(Infinity);previous.fill(-1);
  const point=(index)=>({x:minX+(index%cols)*step,z:minZ+Math.floor(index/cols)*step}),insideShape=(x,z)=>rectangles.some(rect=>Math.abs(x-rect.x)<=rect.width/2+.001&&Math.abs(z-rect.z)<=rect.depth/2+.001),insideRack=(x,z)=>racks.some(rack=>Math.abs(x-rack.x)<(rack.length+clearance*2)/2&&Math.abs(z-rack.z)<(rack.depth+clearance*2)/2);
  for(let index=0;index<total;index++){const candidate=point(index);walkable[index]=insideShape(candidate.x,candidate.z)&&!insideRack(candidate.x,candidate.z)?1:0}
  const nearestIndex=target=>{
    const centerColumn=clamp(Math.round((target.x-minX)/step),0,cols-1),centerRow=clamp(Math.round((target.z-minZ)/step),0,rows-1),limit=Math.max(cols,rows);
    for(let radius=0;radius<limit;radius++){
      let best=-1,bestDistance=Infinity;
      for(let row=Math.max(0,centerRow-radius);row<=Math.min(rows-1,centerRow+radius);row++)for(let column=Math.max(0,centerColumn-radius);column<=Math.min(cols-1,centerColumn+radius);column++){
        if(radius&&row!==centerRow-radius&&row!==centerRow+radius&&column!==centerColumn-radius&&column!==centerColumn+radius)continue;
        const index=row*cols+column;if(!walkable[index])continue;const candidate=point(index),candidateDistance=Math.hypot(candidate.x-target.x,candidate.z-target.z);if(candidateDistance<bestDistance){best=index;bestDistance=candidateDistance}
      }
      if(best>=0)return best;
    }
    return-1;
  };
  const originIndex=nearestIndex(origin),crossesClosedDivider=(from,to)=>{
    if((config.shape||'rectangle')!=='connected')return false;
    const divider=config.roomWidth/2,crosses=(from.x<divider&&to.x>=divider)||(to.x<divider&&from.x>=divider);if(!crosses)return false;
    return Math.abs((from.z+to.z)/2)>(config.doorWidth||1.8)/2-.04;
  };
  if(originIndex>=0){
    const queue=new Int32Array(total);let head=0,tail=0;queue[tail++]=originIndex;distance[originIndex]=0;
    while(head<tail){const current=queue[head++],column=current%cols,row=Math.floor(current/cols),from=point(current),neighbors=[[column-1,row],[column+1,row],[column,row-1],[column,row+1]];for(const [nextColumn,nextRow] of neighbors){if(nextColumn<0||nextColumn>=cols||nextRow<0||nextRow>=rows)continue;const next=nextRow*cols+nextColumn;if(!walkable[next]||Number.isFinite(distance[next])||crossesClosedDivider(from,point(next)))continue;distance[next]=distance[current]+step;previous[next]=current;queue[tail++]=next}}
  }
  const accessCandidates=(slot,rack)=>{
    const offset=clearance+step*.6,axis=rack.accessAxis||(rack.length>=rack.depth?'z':'x'),both=config.access!=='single';
    if(axis==='x')return[{x:rack.x-rack.length/2-offset,z:slot.z},...(both?[{x:rack.x+rack.length/2+offset,z:slot.z}]:[])];
    return[{x:slot.x,z:rack.z-rack.depth/2-offset},...(both?[{x:slot.x,z:rack.z+rack.depth/2+offset}]:[])];
  },resolveAccess=(slot,rack)=>{
    let best=null;
    for(const candidate of accessCandidates(slot,rack)){const index=nearestIndex(candidate);if(index<0||!Number.isFinite(distance[index]))continue;const snapped=point(index),lastMile=Math.hypot(snapped.x-candidate.x,snapped.z-candidate.z),value=distance[index]+lastMile;if(!best||value<best.distance)best={index,distance:value,candidate}}
    return best;
  },pathTo=(slot,rack)=>{
    const access=resolveAccess(slot,rack);if(!access)return[];const indexes=[];for(let index=access.index;index>=0;index=previous[index]){indexes.push(index);if(index===originIndex)break}indexes.reverse();const path=indexes.map(point);if(path.length)path.push(access.candidate);return path;
  },resolvePoint=target=>{
    const index=nearestIndex(target);if(index<0||!Number.isFinite(distance[index]))return null;const snapped=point(index);return{index,distance:distance[index]+Math.hypot(snapped.x-target.x,snapped.z-target.z)};
  },pathToPoint=target=>{
    const resolved=resolvePoint(target);if(!resolved)return[];const indexes=[];for(let index=resolved.index;index>=0;index=previous[index]){indexes.push(index);if(index===originIndex)break}indexes.reverse();const path=indexes.map(point);if(path.length)path.push({x:target.x,z:target.z});return path;
  };
  return{
    step,cols,rows,nodeCount:total,walkableNodeCount:walkable.reduce((sum,value)=>sum+value,0),originIndex,
    distanceToSlot(slot,rack){return resolveAccess(slot,rack)?.distance??Infinity},
    pathToSlot:pathTo,
    distanceToPoint(target){return resolvePoint(target)?.distance??Infinity},
    pathToPoint
  };
}

export function estimateBatchMetrics({products,assignment,slotById,rackBySlot,routingModel,batchSize=20,walkingSpeedMPerMin=60,serviceSecondsPerPick=15,heavyWarningKg=12,heavyMaximumLevel=2}){
  let weightedOneWay=0,totalWeight=0,heavyWarnings=0,unreachableProducts=0;
  for(const product of products){
    const slot=slotById(assignment[product.id]);if(!slot)continue;const weight=Math.max(1,Number(product.picks)||0),routeDistance=routingModel.distanceToSlot(slot,rackBySlot(slot));
    if(!Number.isFinite(routeDistance)){unreachableProducts++;continue}
    weightedOneWay+=weight*routeDistance;totalWeight+=weight;if(Number(product.packageWeightKg)>=heavyWarningKg&&slot.level>heavyMaximumLevel)heavyWarnings++;
  }
  const averageRoundTrip=totalWeight?2*weightedOneWay/totalWeight:0,distanceMeters=averageRoundTrip*batchSize,travelMinutes=walkingSpeedMPerMin>0?distanceMeters/walkingSpeedMPerMin:Infinity,serviceMinutes=batchSize*Math.max(0,serviceSecondsPerPick)/60;
  return{distance:round(distanceMeters),time:round(travelMinutes+serviceMinutes),travelMinutes:round(travelMinutes),serviceMinutes:round(serviceMinutes),heavy:heavyWarnings,unreachableProducts,batchSize,walkingSpeedMPerMin,serviceSecondsPerPick,model:'aisle-grid-round-trip'};
}

export function cubePerOrderIndex(product,requiredLocations=1){return Math.max(1,requiredLocations)/Math.max(1,Number(product.picks)||0)}

export function routeImprovementPercent(candidateDistance,baseDistance){return baseDistance>0?round((baseDistance-candidateDistance)/baseDistance*100):0}

const footprintWidth=item=>Number(item?.length??item?.width)||0;
const footprintDepth=item=>Number(item?.depth)||0;

export function rectanglesOverlap(a,b,tolerance=.001){
  return Math.abs(Number(a?.x)-Number(b?.x))<(footprintWidth(a)+footprintWidth(b))/2-tolerance&&Math.abs(Number(a?.z)-Number(b?.z))<(footprintDepth(a)+footprintDepth(b))/2-tolerance;
}

export function rackZoneViolations(racks=[],zones=[]){
  const violations=[];
  for(const rack of racks)for(const zone of zones)if(rectanglesOverlap(rack,zone))violations.push({rackId:rack.id,zoneId:zone.id,zoneType:zone.type||'zone',zoneLabel:zone.label||zone.id});
  return violations;
}

export function entitiesOutsideRooms(entities=[],rooms=[]){
  return entities.filter(item=>!rooms.some(room=>Math.abs(Number(item.x)-Number(room.x))+footprintWidth(item)/2<=Number(room.width)/2+.001&&Math.abs(Number(item.z)-Number(room.z))+footprintDepth(item)/2<=Number(room.depth)/2+.001)).map(item=>item.id);
}

export function classifyWorkflowZones(zones=[]){
  const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),text=zone=>normalized(`${zone.id||''} ${zone.label||''} ${zone.role||''}`),isReceiving=zone=>/(receiving|inbound|entrance)/.test(text(zone)),isDispatch=zone=>/(^|\s)(dispatch|shipping|outbound)(\s|$)/.test(text(zone)),isPreparation=zone=>/(packing|consolidation|staging)/.test(text(zone));
  const explicitDispatch=zones.find(zone=>isDispatch(zone)&&!isReceiving(zone)),dockCandidates=zones.filter(zone=>zone.type==='dock'&&!isReceiving(zone)&&!isPreparation(zone)),dispatch=explicitDispatch||(dockCandidates.length===1?dockCandidates[0]:null),preparation=zones.find(zone=>isPreparation(zone)&&zone!==dispatch&&!isReceiving(zone))||zones.find(zone=>zone.type==='shipping'&&zone!==dispatch&&!isReceiving(zone))||null,warnings=[];
  if(!explicitDispatch&&dispatch)warnings.push('INFERRED_SINGLE_DOCK_AS_DISPATCH');
  if(!dispatch)warnings.push(dockCandidates.length>1?'AMBIGUOUS_DISPATCH_DOCKS':'MISSING_DISPATCH_ZONE');
  return{preparation,dispatch,warnings};
}

export function buildRepresentativeBatchRoute({products,assignment,slotById,rackBySlot,routingModel,batchSize=20}){
  const weighted=products.map(product=>({product,weight:Math.max(1,Number(product.picks)||0)})).filter(item=>assignment[item.product.id]),total=weighted.reduce((sum,item)=>sum+item.weight,0),route=[];if(!total)return route;
  for(let pick=0;pick<batchSize;pick++){
    const target=(pick+.5)*total/batchSize;let cumulative=0,selected=weighted.at(-1)?.product;for(const item of weighted){cumulative+=item.weight;if(cumulative>=target){selected=item.product;break}}
    const slot=slotById(assignment[selected.id]);if(!slot)continue;const outbound=routingModel.pathToSlot(slot,rackBySlot(slot));if(!outbound.length)continue;const roundTrip=[...outbound,...outbound.slice(0,-1).reverse()];if(route.length&&roundTrip.length)roundTrip.shift();route.push(...roundTrip);
  }
  return route;
}
