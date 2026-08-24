import { create } from "zustand";
import { db, id } from "./db";
import type { CanvasEdge, CanvasNode, Point, Project, TaskNode } from "./types";

type Store = {
  projects: Project[]; project?: Project; assets: Record<string, string>; selected: string[]; ready: boolean; error?: string;
  initialize(): Promise<void>; refresh(projectId?: string): Promise<void>; createProject(): Promise<void>; openProject(id: string): Promise<void>; renameProject(): Promise<void>;
  addTask(position: Point): Promise<void>; addText(position: Point): Promise<void>; addImage(file: File, position: Point): Promise<void>;
  updateNode(nodeId: string, patch: Partial<CanvasNode>): Promise<void>; moveNode(nodeId: string, position: Point): Promise<void>; connect(source: string, target: string): Promise<void>;
  setSelected(ids: string[]): void; deleteSelected(): Promise<void>; duplicateTask(taskId: string): Promise<void>; runTask(taskId: string): Promise<void>; openTask(taskId: string): Promise<void>; hibernate(): Promise<number>; backup(): Promise<void>;
};

const urlsFor = async (project: Project) => Object.fromEntries((await Promise.all(project.graph.nodes.flatMap(node => node.kind === "image" || node.kind === "result" ? [db.assets.get(node.assetId).then(a => a ? [node.assetId, URL.createObjectURL(a.blob)] as const : undefined)] : []))).filter(Boolean) as Array<readonly [string,string]>);
let initialization: Promise<void> | undefined;
const mutate = async (projectId: string, fn: (project: Project) => Project) => db.transaction("rw", db.projects, async () => {
  const current = await db.projects.get(projectId); if (!current) throw new Error("找不到画布项目");
  const next = { ...fn(structuredClone(current)), updatedAt: Date.now() }; await db.projects.put(next); return next;
});

export const useStore = create<Store>((set,get) => ({
  projects: [], assets: {}, selected: [], ready: false,
  async initialize() {
    if (!initialization) initialization = (async () => {
      let projects = await db.projects.orderBy("updatedAt").reverse().toArray();
      if (!projects.length) { const now=Date.now(); await db.projects.add({id:id("project"),name:"我的第一个画布",graph:{nodes:[],edges:[]},createdAt:now,updatedAt:now}); projects=await db.projects.orderBy("updatedAt").reverse().toArray(); }
      const project=projects[0]; set({projects,project,assets:await urlsFor(project),ready:true});
      if (globalThis.chrome?.runtime?.id) chrome.runtime.onMessage.addListener((message) => { if (message?.persisted && message.projectId===get().project?.id) void get().refresh(message.projectId); });
    })();
    return initialization;
  },
  async refresh(projectId) { const project=await db.projects.get(projectId??get().project?.id??""); if(!project)return; set({project,projects:await db.projects.orderBy("updatedAt").reverse().toArray(),assets:await urlsFor(project)}); },
  async createProject(){const now=Date.now(),project={id:id("project"),name:`新画布 ${get().projects.length+1}`,graph:{nodes:[],edges:[]},createdAt:now,updatedAt:now};await db.projects.add(project);set({project,projects:await db.projects.orderBy("updatedAt").reverse().toArray(),assets:{},selected:[]});},
  async openProject(projectId){const project=await db.projects.get(projectId);if(project)set({project,assets:await urlsFor(project),selected:[]});},
  async renameProject(){const p=get().project;if(!p)return;const name=prompt("给当前画布起个名字",p.name)?.trim();if(!name)return;const project=await mutate(p.id,x=>({...x,name}));set({project,projects:await db.projects.orderBy("updatedAt").reverse().toArray()});},
  async addTask(position){const p=get().project;if(!p)return;const count=p.graph.nodes.filter(n=>n.kind==="task").length+1;const task:TaskNode={id:id("task"),kind:"task",name:`生图任务 ${String(count).padStart(2,"0")}`,prompt:"",position,inputEdgeOrder:[],runCount:0,status:"idle",aspectRatio:"auto"};const project=await mutate(p.id,x=>({...x,graph:{...x.graph,nodes:[...x.graph.nodes,task]}}));set({project});},
  async addText(position){const p=get().project;if(!p)return;const node:CanvasNode={id:id("text"),kind:"text",text:"",position};const project=await mutate(p.id,x=>({...x,graph:{...x.graph,nodes:[...x.graph.nodes,node]}}));set({project});},
  async addImage(file,position){const p=get().project;if(!p)return;const assetId=id("asset");await db.assets.add({id:assetId,blob:file,createdAt:Date.now()});const node:CanvasNode={id:id("image"),kind:"image",assetId,title:file.name,position};const project=await mutate(p.id,x=>({...x,graph:{...x.graph,nodes:[...x.graph.nodes,node]}}));set(s=>({project,assets:{...s.assets,[assetId]:URL.createObjectURL(file)}}));},
  async updateNode(nodeId,patch){const p=get().project;if(!p)return;const project=await mutate(p.id,x=>({...x,graph:{...x.graph,nodes:x.graph.nodes.map(n=>n.id===nodeId?{...n,...patch} as CanvasNode:n)}}));set({project});},
  async moveNode(nodeId,position){await get().updateNode(nodeId,{position} as Partial<CanvasNode>);},
  async connect(source,target){const p=get().project;if(!p||source===target)return;const edge:CanvasEdge={id:id("edge"),source,target,kind:"input"};const project=await mutate(p.id,x=>({...x,graph:{...x.graph,edges:[...x.graph.edges,edge],nodes:x.graph.nodes.map(n=>n.id===target&&n.kind==="task"?{...n,inputEdgeOrder:[...n.inputEdgeOrder,edge.id]}:n)}}));set({project});},
  setSelected(selected){set({selected});},
  async deleteSelected(){const p=get().project,ids=new Set(get().selected);if(!p||!ids.size)return;for(const n of p.graph.nodes)if(ids.has(n.id)&&n.kind==="task")await chrome.runtime?.sendMessage({type:"CANCEL_TASK",projectId:p.id,taskId:n.id}).catch(()=>{});const project=await mutate(p.id,x=>({...x,graph:{nodes:x.graph.nodes.filter(n=>!ids.has(n.id)),edges:x.graph.edges.filter(e=>!ids.has(e.source)&&!ids.has(e.target))}}));set({project,selected:[]});},
  async duplicateTask(taskId){const p=get().project;if(!p)return;const source=p.graph.nodes.find(n=>n.id===taskId&&n.kind==="task") as TaskNode|undefined;if(!source)return;const copy={...source,id:id("task"),name:`${source.name} 副本`,position:{x:source.position.x+36,y:source.position.y+36},status:"idle" as const,runCount:0,conversationUrl:undefined,inputEdgeOrder:[]};const project=await mutate(p.id,x=>({...x,graph:{...x.graph,nodes:[...x.graph.nodes,copy]}}));set({project});},
  async runTask(taskId){const p=get().project;if(!p||!chrome.runtime?.id)return;await get().updateNode(taskId,{status:"queued"} as Partial<TaskNode>);await chrome.runtime.sendMessage({type:"RUN_TASK",projectId:p.id,taskId});},
  async openTask(taskId){const p=get().project;if(p&&chrome.runtime?.id)await chrome.runtime.sendMessage({type:"OPEN_TASK_TAB",projectId:p.id,taskId});},
  async hibernate(){const p=get().project;if(!p||!chrome.runtime?.id)return 0;const taskIds=p.graph.nodes.filter(n=>n.kind==="task"&&!(["queued","waiting_page","uploading","sending","generating"] as string[]).includes(n.status)).map(n=>n.id);const r=await chrome.runtime.sendMessage({type:"HIBERNATE_TASK_TABS",projectId:p.id,taskIds});return r?.released??0;},
  async backup(){const p=get().project;if(!p)return;const payload={version:1,project:p,assets:await Promise.all(p.graph.nodes.flatMap(n=>n.kind==="image"||n.kind==="result"?[db.assets.get(n.assetId).then(async a=>a?{id:a.id,type:a.blob.type,data:Array.from(new Uint8Array(await a.blob.arrayBuffer()))}:null)]:[]))};const blob=new Blob([JSON.stringify(payload)],{type:"application/json"});const url=URL.createObjectURL(blob);await chrome.downloads?.download({url,filename:`${p.name}.gptcanvas.json`,saveAs:true});setTimeout(()=>URL.revokeObjectURL(url),30000);}
}));
