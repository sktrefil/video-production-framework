import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProductionAsset, ProviderJob } from "@vpf/domain";
import { RuntimeOrchestrator, RuntimeExecutorRegistry } from "@vpf/provider-orchestrator";
import { ImageRuntimeExecutor, MockImageProvider } from "@vpf/provider-orchestrator/image-runtime";
import { SqliteImageRuntimeRepository } from "../src/image-runtime.js";
import { SqliteSceneAssetRepository } from "../src/scene-assets.js";
import { png } from "../../provider-orchestrator/test/image-fixture.js";
import { SceneAssetPipeline } from "@vpf/scene-assets";

for (const fail of [false,true]) test(`image runtime atomic WF-09 integration: ${fail ? "failure" : "candidate"}`,async()=>{
  const workspaceRoot=await mkdtemp(join(tmpdir(),"vpf-image-db-"));
  const filename=join(workspaceRoot,"project.db");
  const scene=new SqliteSceneAssetRepository(filename);
  const runtime=new SqliteImageRuntimeRepository(filename);
  let n=0; const now=()=>new Date().toISOString();
  const event=(id:string)=>({eventId:id,projectId:"p",eventType:"TEST",targetType:"ASSET" as const,targetId:"asset",trigger:"USER" as const,createdAt:now()});
  const outbox=(id:string)=>({outboxId:"out-"+id,eventId:id,status:"PENDING" as const,attempts:0,createdAt:now()});
  try {
    const asset:ProductionAsset={id:"asset",projectId:"p",revision:1,lifecycleStatus:"ACTIVE",createdAt:now(),updatedAt:now(),stale:false,
      assetClass:"PRIMARY_SCENE",assetRole:"STANDARD",productionPriority:"STANDARD",sourceStrategy:"GENERATE",
      owner:{type:"SCENE",id:"scene"},stateRef:{entityType:"SCENE",entityId:"scene",stateField:"STATE_CURRENT"},
      design:{visualGoal:"approved",composition:"approved",continuityRequirements:[],identityAnchorIds:[],factualConstraints:[],avoidances:[]},
      candidateMediaIds:[],assetStatus:"DESIGNED",sourceSceneRevision:1,sourceProjectStyleId:"style",sourceProjectStyleRevision:1,
      sourceIdentityAnchorRevisions:{},formatProfileVersion:"1.0.0"};
    await scene.commitAssetDesign({previous:null,next:asset,event:event("design"),outbox:outbox("design")});
    const input={prompt:"  unchanged\r\n한글  ",negativePrompt:"",width:16,height:9,aspectRatio:"16:9",
      formatProfile:{resourceId:"format",version:"1.0.0",contentHash:"a".repeat(64)},references:[],outputRelativePath:"05_images/image.png"};
    const job:ProviderJob={id:"job",projectId:"p",revision:1,lifecycleStatus:"ACTIVE",createdAt:now(),updatedAt:now(),
      jobType:"IMAGE_GENERATION",provider:"MOCK",providerProfileVersion:"1.0.0",targetType:"ASSET",targetId:"asset",targetRevision:2,
      executionMode:"AUTOMATED",status:"READY",attempt:1,inputPayload:input,resultMediaIds:[]};
    await scene.createProviderJob({job,asset:{...asset,revision:2,assetStatus:"GENERATING"},event:event("create"),outbox:outbox("create")});
    const adapter=new MockImageProvider("MOCK","1.0.0",png());
    if(fail) adapter.generate=async()=>{throw new Error("offline");};
    const registry=new RuntimeExecutorRegistry();
    registry.register({provider:"MOCK",jobType:"IMAGE_GENERATION",executor:new ImageRuntimeExecutor(adapter,
      {async resolve(){return {...input.formatProfile,payload:{aspectRatio:"16:9",imageGeneration:{width:16,height:9}}};}}, {workspaceRoot})});
    const orchestrator=new RuntimeOrchestrator(runtime,runtime,registry,{nowIso:now},{next:prefix=>prefix+ ++n},{workspaceRoot});
    const outcome=await orchestrator.executeAutomated("p","job",{expectedOutputs:[{role:"image",mediaType:"IMAGE",required:true}]});
    assert.equal(outcome.providerJob.status,fail?"FAILED":"COMPLETE");
    const current=await scene.getLatestAsset("p","asset");
    assert.equal(current?.assetStatus,fail?"REGENERATE_REQUIRED":"CANDIDATE_AVAILABLE");
    assert.equal(current?.approvedMediaId,undefined);
    assert.equal(current?.candidateMediaIds.length,fail?0:1);
    if(!fail){
      assert.equal(outcome.media[0]?.mediaStatus,"AVAILABLE");
      assert.equal(current?.candidateMediaIds[0],outcome.media[0]?.id);
      assert.equal(await scene.getLatestQcForMedia("p","asset",outcome.media[0]!.id),null);
      // Approval must reject the actual runtime-ingested candidate before IMAGE_QC.
      const pipeline = new SceneAssetPipeline(scene, {} as never, {} as never, {} as never, {} as never,
        {shouldAutoApprove:()=>false}, {nowIso:now}, {next:prefix=>prefix+ ++n});
      await assert.rejects(pipeline.approveAsset({projectId:"p",assetId:"asset",mediaId:outcome.media[0]!.id}),
        {code:"IMAGE_QC_REQUIRED"});
    }
    assert.deepEqual((await runtime.listRuntimeReceipts("p","job")).map(r=>r.stage),["RUNNING",fail?"FAILED":"COMPLETE"]);
  } finally {runtime.close();scene.close();}
});
