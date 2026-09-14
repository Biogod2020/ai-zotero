'use strict';
const {performance}=require('node:perf_hooks');const C=require('../addon/content/core.js');
const n=5000, topics=['diffusion histopathology cell segmentation','spatial transcriptomics scientific agent','multiagent judging reasoning evaluation','robotic ultrasound medical imaging'];
const docs=Array.from({length:n},(_,i)=>({id:String(i),libraryID:1,title:topics[i%4]+' experiment '+i,abstract:('domain'+i%97+' '+topics[i%4]+' ').repeat(8),year:'2026',tags:[],text:('token'+i%193+' reported reproducible methodology ').repeat(200)}));
let t=performance.now();const idx=new C.LocalIndex(docs);const build=performance.now()-t;const times=[];for(let i=0;i<50;i++){t=performance.now();idx.search(topics[i%4]);times.push(performance.now()-t);}times.sort((a,b)=>a-b);
t=performance.now();C.rankRadar(docs.slice(0,100).map((d,i)=>({...d,id:'r'+i,published:'2026-09-14'})),C.DEFAULT_PROFILES,idx,['0','2']);const radar=performance.now()-t;
console.log(JSON.stringify({node:process.version,documents:n,synthetic:true,indexBuildMs:Math.round(build),searchMedianMs:+times[25].toFixed(2),searchP95Ms:+times[47].toFixed(2),rank100RadarMs:Math.round(radar),heapMB:Math.round(process.memoryUsage().heapUsed/1048576)},null,2));
