import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { handleV1Api } from "../worker/v1-api.ts";

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.values=[]}
  bind(...values){this.values=values;return this}
  async first(){return this.db.prepare(this.sql).get(...this.values)??null}
  async all(){return {results:this.db.prepare(this.sql).all(...this.values)}}
  async run(){const result=this.db.prepare(this.sql).run(...this.values);return {meta:{changes:Number(result.changes)}}}
}
class D1 {
  constructor(){this.sqlite=new DatabaseSync(":memory:");for(const name of ["0000_eureka_v1.sql","0001_eureka_accounts.sql","0002_eureka_identifiers.sql"])this.sqlite.exec(readFileSync(new URL(`../drizzle/${name}`,import.meta.url),"utf8"))}
  prepare(sql){return new Statement(this.sqlite,sql)}
  async batch(statements){this.sqlite.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());this.sqlite.exec("COMMIT");return results}catch(error){this.sqlite.exec("ROLLBACK");throw error}}
}
class Bucket { constructor(){this.data=new Map()} async put(key,value,options){this.data.set(key,{value,options})} async get(key){const item=this.data.get(key);if(!item)return null;return {body:item.value,httpEtag:"test",writeHttpMetadata(){}}} async delete(key){this.data.delete(key)} }

const env=()=>({DB:new D1(),BUCKET:new Bucket(),OWNER_BOOTSTRAP_EMAIL:"fael@example.ch",OWNER_BOOTSTRAP_TOKEN:"owner-test-code",EUREKA_TEST_MODE:"true"});
async function call(runtime,method,path,cookie,payload){const headers={};if(cookie)headers.cookie=cookie;let body;if(payload instanceof FormData)body=payload;else if(payload!==undefined){headers["content-type"]="application/json";body=JSON.stringify(payload)}const response=await handleV1Api(new Request(`https://example.test/api/v1${path}`,{method,headers,body}),runtime);return {status:response.status,data:await response.json(),cookie:response.headers.get("set-cookie")?.split(";")[0]||cookie}}
async function register(runtime,name,email,password="Motdepasse1",extra={}){const result=await call(runtime,"POST","/auth/register","",{name,email,password,...extra});assert.equal(result.status,201);return result.cookie}
async function form(fields,fileName="document.pdf"){const data=new FormData();for(const [key,value] of Object.entries(fields))data.set(key,String(value));data.set("file",new File(["contenu"],fileName,{type:"application/pdf"}));return data}

test("comptes Eurêka, permissions et workflow persistant",async()=>{
  const runtime=env();
  const owner=await register(runtime,"Fael Mendi","fael@example.ch","Motdepasse1",{ownerCode:"owner-test-code"});
  assert.equal((await call(runtime,"GET","/session",owner)).data.currentUser.globalAdmin,true);
  const created=await call(runtime,"POST","/trades",owner,{name:"Automobile"});assert.equal(created.status,201);assert.equal(created.data.empty,true);
  const tradeId=created.data.id;
  assert.equal(runtime.DB.sqlite.prepare("SELECT COUNT(*) count FROM admin_invitations WHERE trade_id=?").get(tradeId).count,0);
  const invitedAdmin=await call(runtime,"POST","/admin-invitations",owner,{displayName:"Admin Auto",email:"admin.auto@example.ch",role:"admin_metier",tradeId});assert.equal(invitedAdmin.status,201);
  const admin=await register(runtime,"Admin Auto","admin.auto@example.ch","Motdepasse2",{invitationCode:invitedAdmin.data.invitationCode});
  const pendingAdmin=(await call(runtime,"GET","/session",admin)).data;
  assert.equal(pendingAdmin.memberships.length,0);
  assert.equal(pendingAdmin.pendingAdminInvitation.role,"admin_metier");
  const invitation=(await call(runtime,"GET","/session",owner)).data.adminInvitations.find(item=>item.email==="admin.auto@example.ch");
  assert.ok(invitation?.account_user_id);
  const approvedAdmin=await call(runtime,"PATCH",`/admin-invitations/${invitation.id}/decision`,owner,{decision:"accepted",userId:invitation.account_user_id});
  assert.equal(approvedAdmin.status,200);
  assert.equal((await call(runtime,"GET","/session",admin)).data.memberships[0].trade_id,tradeId);

  async function acceptMember(name,email,role){
    const account=await register(runtime,name,email);
    const request=await call(runtime,"POST","/membership-requests",account,await form({tradeId,role,message:"Test"},`${role}.pdf`));assert.equal(request.status,201);
    const decision=await call(runtime,"PATCH",`/membership-requests/${request.data.id}/decision`,admin,{decision:"accepted"});assert.equal(decision.status,200);
    return {account,membership:(await call(runtime,"GET","/session",account)).data.memberships[0]};
  }
  const mandataire=await acceptMember("Mandataire Test","mand@example.ch","mandataire");
  const freelance=await acceptMember("Freelance Test","free@example.ch","freelance");
  const freelance2=await acceptMember("Freelance Deux","free2@example.ch","freelance");
  const freelanceSession=(await call(runtime,"GET","/session",freelance.account)).data;
  const freelance2Session=(await call(runtime,"GET","/session",freelance2.account)).data;
  assert.notEqual(freelanceSession.currentUser.id,freelance2Session.currentUser.id);
  assert.equal(freelanceSession.memberships[0].role,"freelance");
  assert.equal(freelance2Session.memberships[0].role,"freelance");
  assert.equal((await call(runtime,"POST","/trades",freelance.account,{name:"Interdit"})).status,403);
  await call(runtime,"POST","/auth/logout",freelance.account,{});
  assert.equal((await call(runtime,"GET","/session",freelance.account)).status,401);
  assert.equal((await call(runtime,"GET","/session",freelance2.account)).status,200);
  const relogin=await call(runtime,"POST","/auth/login","",{email:"free@example.ch",password:"Motdepasse1"});
  assert.equal(relogin.status,200);
  freelance.account=relogin.cookie;
  runtime.DB.sqlite.prepare("UPDATE trade_memberships SET project_class='C',credits=50 WHERE id=?").run(freelance.membership.id);
  const foreign=await register(runtime,"Freelance Horlogerie","foreign@example.ch");
  const foreignRequest=await call(runtime,"POST","/membership-requests",foreign,await form({tradeId:"trade-rd-horlogerie",role:"freelance"},"foreign.pdf"));assert.equal(foreignRequest.status,201);

  const quoteRequest=await call(runtime,"POST","/quote-requests",mandataire.account,await form({tradeId,personalNumber:"DEV-001",projectName:"Projet réel"},"demande.pdf"));assert.equal(quoteRequest.status,201);
  const quote=await call(runtime,"POST","/quotes",admin,{requestId:quoteRequest.data.id,projectClass:"C",requiredCredits:30,amountCents:1250000,eurekaNumber:"EUR-001",projectName:"Projet réel"});assert.equal(quote.status,201);
  const accepted=await call(runtime,"PATCH",`/quotes/${quote.data.id}/accept`,mandataire.account,{});assert.equal(accepted.status,200);
  const denied=await call(runtime,"POST",`/missions/${accepted.data.missionId}/applications`,foreign,{});assert.equal(denied.status,403);
  const applied=await call(runtime,"POST",`/missions/${accepted.data.missionId}/applications`,freelance.account,{});assert.equal(applied.status,201);
  const assigned=await call(runtime,"POST",`/missions/${accepted.data.missionId}/assign`,mandataire.account,{applicationId:applied.data.id});assert.equal(assigned.status,201);
  const duplicate=await call(runtime,"POST",`/missions/${accepted.data.missionId}/assign`,mandataire.account,{applicationId:applied.data.id});assert.notEqual(duplicate.status,201);
  const project=runtime.DB.sqlite.prepare("SELECT * FROM projects WHERE id=?").get(assigned.data.projectId);assert.equal(project.trade_id,tradeId);assert.equal(project.freelancer_membership_id,freelance.membership.id);
  assert.equal(runtime.DB.sqlite.prepare("SELECT reserved_credits FROM trade_memberships WHERE id=?").get(freelance.membership.id).reserved_credits,30);
});

test("inscriptions publiques, validation métier et isolation serveur",async()=>{
  const runtime=env();
  const owner=await register(runtime,"Fael Mendi","fael@example.ch","Motdepasse1",{ownerCode:"owner-test-code"});
  const tradeA=(await call(runtime,"POST","/trades",owner,{name:"Horlogerie"})).data;
  const tradeB=(await call(runtime,"POST","/trades",owner,{name:"Architecture"})).data;
  const inviteA=await call(runtime,"POST","/admin-invitations",owner,{displayName:"Admin Horlogerie",email:"admin.h@example.ch",role:"admin_metier",tradeId:tradeA.id});
  const inviteB=await call(runtime,"POST","/admin-invitations",owner,{displayName:"Admin Architecture",email:"admin.a@example.ch",role:"admin_metier",tradeId:tradeB.id});
  const adminA=await register(runtime,"Admin Horlogerie","admin.h@example.ch","Motdepasse2",{invitationCode:inviteA.data.invitationCode});
  const adminB=await register(runtime,"Admin Architecture","admin.a@example.ch","Motdepasse2",{invitationCode:inviteB.data.invitationCode});
  for(const [email,cookie] of [["admin.h@example.ch",adminA],["admin.a@example.ch",adminB]]){
    const invite=(await call(runtime,"GET","/session",owner)).data.adminInvitations.find(item=>item.email===email);
    assert.equal((await call(runtime,"PATCH",`/admin-invitations/${invite.id}/decision`,owner,{decision:"accepted",userId:invite.account_user_id})).status,200);
    assert.equal((await call(runtime,"GET","/session",cookie)).data.memberships.length,1);
  }
  assert.equal((await call(runtime,"GET","/public/trades","")).data.trades.length,3);

  async function publicRequest(name,email,role,tradeId){
    const account=await register(runtime,name,email);
    const request=await call(runtime,"POST","/membership-requests",account,await form({tradeId,role,message:"Adhésion publique"},`${role}.pdf`));
    assert.equal(request.status,201);
    const pending=(await call(runtime,"GET","/session",account)).data;
    assert.equal(pending.memberships.length,0);
    assert.equal(pending.membershipRequests[0].status,"pending");
    return {account,requestId:request.data.id};
  }
  const freelance=await publicRequest("Freelance Public","public.free@example.ch","freelance",tradeA.id);
  const mandataire=await publicRequest("Mandataire Public","public.mand@example.ch","mandataire",tradeA.id);
  const adminBState=(await call(runtime,"GET","/session",adminB)).data;
  assert.equal(adminBState.membershipRequests.some(item=>item.id===freelance.requestId||item.id===mandataire.requestId),false);
  assert.equal((await call(runtime,"PATCH",`/membership-requests/${freelance.requestId}/decision`,adminB,{decision:"accepted"})).status,403);
  assert.equal((await call(runtime,"PATCH",`/membership-requests/${mandataire.requestId}/decision`,adminB,{decision:"accepted"})).status,403);
  assert.equal((await call(runtime,"PATCH",`/membership-requests/${freelance.requestId}/decision`,adminA,{decision:"accepted"})).status,200);
  assert.equal((await call(runtime,"PATCH",`/membership-requests/${mandataire.requestId}/decision`,adminA,{decision:"accepted"})).status,200);
  assert.equal((await call(runtime,"GET","/session",freelance.account)).data.memberships[0].role,"freelance");
  assert.equal((await call(runtime,"GET","/session",mandataire.account)).data.memberships[0].role,"mandataire");
  await call(runtime,"POST","/auth/logout",freelance.account,{});
  const relogin=await call(runtime,"POST","/auth/login","",{email:"public.free@example.ch",password:"Motdepasse1"});
  assert.equal(relogin.status,200);
  assert.equal((await call(runtime,"GET","/session",relogin.cookie)).data.memberships[0].trade_id,tradeA.id);
});

test("invitations administratives validées, rôles publics interdits et spécialiste supprimé",async()=>{
  const runtime=env();
  const owner=await register(runtime,"Fael Mendi","fael@example.ch","Motdepasse1",{ownerCode:"owner-test-code"});
  const trade=(await call(runtime,"POST","/trades",owner,{name:"Horlogerie"})).data;
  const invitation=await call(runtime,"POST","/admin-invitations",owner,{displayName:"Isiane Mendi",email:"isiane.mendi@example.ch",role:"admin_eureka"});
  assert.equal(invitation.status,201);
  const invited=await register(runtime,"Isiane Mendi","isiane.mendi@example.ch","Motdepasse2",{invitationCode:invitation.data.invitationCode,role:"admin_eureka"});
  assert.equal((await call(runtime,"GET","/session",invited)).data.currentUser.globalAdmin,false);
  const ownerState=(await call(runtime,"GET","/session",owner)).data;
  const pending=ownerState.adminInvitations.find(item=>item.id===invitation.data.id);
  assert.ok(pending.account_user_id);
  assert.equal((await call(runtime,"PATCH",`/admin-invitations/${invitation.data.id}/decision`,invited,{decision:"accepted",userId:pending.account_user_id})).status,403);
  assert.equal((await call(runtime,"PATCH",`/admin-invitations/${invitation.data.id}/decision`,owner,{decision:"accepted",userId:pending.account_user_id})).status,200);
  assert.equal((await call(runtime,"GET","/session",invited)).data.currentUser.globalAdmin,true);
  assert.equal((await call(runtime,"POST","/admin-invitations",owner,{displayName:"Interdit",email:"spec@example.ch",role:"specialiste_metier",tradeId:trade.id})).status,400);
  const publicAccount=await register(runtime,"Compte Public","public@example.ch","Motdepasse3",{role:"admin_eureka"});
  assert.equal((await call(runtime,"GET","/session",publicAccount)).data.currentUser.globalAdmin,false);

  const legacyInvite=await call(runtime,"POST","/admin-invitations",owner,{displayName:"Frère Mendi",email:"invite.diff@example.ch",role:"admin_eureka"});
  const legacyAccount=await register(runtime,"Frère Mendi","compte.reel@example.ch");
  const legacyRequest=await call(runtime,"POST","/membership-requests",legacyAccount,await form({tradeId:trade.id,role:"freelance"},"adhesion.pdf"));
  assert.equal(legacyRequest.status,201);
  const linked=(await call(runtime,"GET","/session",owner)).data.adminInvitations.find(item=>item.id===legacyInvite.data.id);
  assert.ok(linked.account_user_id);
  assert.equal((await call(runtime,"PATCH",`/admin-invitations/${linked.id}/decision`,owner,{decision:"accepted",userId:linked.account_user_id})).status,200);
  assert.equal((await call(runtime,"GET","/session",legacyAccount)).data.currentUser.globalAdmin,true);
  assert.equal(runtime.DB.sqlite.prepare("SELECT status FROM membership_requests WHERE id=?").get(legacyRequest.data.id).status,"withdrawn");
});

test("bootstrap propriétaire compatible et utilisable une seule fois",async()=>{
  const runtime=env();
  runtime.DB.sqlite.prepare("INSERT INTO users (id,auth_subject,email,display_name,email_verified) VALUES (?,?,?,?,1)").run("owner-existing","legacy-owner","fael@example.ch","Fael Mendi");
  runtime.DB.sqlite.prepare("INSERT INTO profiles (user_id) VALUES (?)").run("owner-existing");
  runtime.DB.sqlite.prepare("INSERT INTO global_roles (user_id,role) VALUES (?,'admin_eureka')").run("owner-existing");

  const wrong=await call(runtime,"POST","/auth/register","",{name:"Fael Mendi",email:" fael@example.ch ",password:"Motdepasse1",ownerCode:"mauvais-code"});
  assert.equal(wrong.status,403);
  assert.equal(runtime.DB.sqlite.prepare("SELECT COUNT(*) count FROM account_credentials").get().count,0);

  const created=await call(runtime,"POST","/auth/register","",{name:"Fael Mendi",email:" FAEL@example.ch ",password:"Motdepasse1",ownerCode:" owner-test-code "});
  assert.equal(created.status,201);
  assert.equal(created.data.owner,true);
  assert.equal(runtime.DB.sqlite.prepare("SELECT password_iterations FROM account_credentials WHERE user_id='owner-existing'").get().password_iterations,100000);
  assert.equal((await call(runtime,"GET","/session",created.cookie)).data.currentUser.globalAdmin,true);

  const reused=await call(runtime,"POST","/auth/register","",{name:"Fael Mendi",email:"fael@example.ch",password:"Autrepass2",ownerCode:"owner-test-code"});
  assert.equal(reused.status,409);
  assert.equal(runtime.DB.sqlite.prepare("SELECT COUNT(*) count FROM account_credentials WHERE user_id='owner-existing'").get().count,1);
});

test("connexion, mauvais mot de passe et récupération",async()=>{
  const runtime=env();const cookie=await register(runtime,"Utilisateur Test","user@example.ch");
  assert.equal((await call(runtime,"POST","/auth/login","",{email:"user@example.ch",password:"incorrect1"})).status,401);
  assert.equal((await call(runtime,"POST","/auth/login","",{email:"user@example.ch",password:"Motdepasse1"})).status,200);
  const forgot=await call(runtime,"POST","/auth/forgot-password","",{email:"user@example.ch"});assert.ok(forgot.data.resetCode);
  const reset=await call(runtime,"POST","/auth/reset-password","",{email:"user@example.ch",code:forgot.data.resetCode,password:"Nouveaupass2"});assert.equal(reset.status,200);
  assert.equal((await call(runtime,"GET","/session",cookie)).status,401);
});

test("suppression sécurisée des utilisateurs et métiers",async()=>{
  const runtime=env();
  const owner=await register(runtime,"Fael Mendi","fael@example.ch","Motdepasse1",{ownerCode:"owner-test-code"});
  const disposable=await register(runtime,"Compte à supprimer","delete@example.ch");
  const disposableId=(await call(runtime,"GET","/session",disposable)).data.currentUser.id;
  const unauthorized=await call(runtime,"DELETE",`/users/${disposableId}`,disposable);
  assert.equal(unauthorized.status,403);
  assert.equal(runtime.DB.sqlite.prepare("SELECT COUNT(*) count FROM users WHERE id=?").get(disposableId).count,1);

  const removed=await call(runtime,"DELETE",`/users/${disposableId}`,owner);
  assert.equal(removed.status,200);
  assert.equal(removed.data.message,"Utilisateur supprimé avec succès.");
  assert.equal(runtime.DB.sqlite.prepare("SELECT COUNT(*) count FROM users WHERE id=?").get(disposableId).count,0);
  assert.equal((await call(runtime,"GET","/session",owner)).data.users.some(user=>user.id===disposableId),false);
  assert.equal((await call(runtime,"DELETE",`/users/${disposableId}`,owner)).status,404);
  assert.equal((await call(runtime,"DELETE",`/users/${(await call(runtime,"GET","/session",owner)).data.currentUser.id}`,owner)).status,409);

  const used=await register(runtime,"Compte avec dépendance","used@example.ch");
  const usedId=(await call(runtime,"GET","/session",used)).data.currentUser.id;
  const request=await call(runtime,"POST","/membership-requests",used,await form({tradeId:"trade-rd-horlogerie",role:"freelance"},"adhesion.pdf"));
  assert.equal(request.status,201);
  const removedPendingUser=await call(runtime,"DELETE",`/users/${usedId}`,owner);
  assert.equal(removedPendingUser.status,200);
  assert.equal(runtime.DB.sqlite.prepare("SELECT COUNT(*) count FROM membership_requests WHERE user_id=?").get(usedId).count,0);
  assert.equal(runtime.BUCKET.data.size,0);

  const emptyTrade=await call(runtime,"POST","/trades",owner,{name:"Métier vide"});
  assert.equal(emptyTrade.status,201);
  const removedTrade=await call(runtime,"DELETE",`/trades/${emptyTrade.data.id}`,owner);
  assert.equal(removedTrade.status,200);
  assert.equal(removedTrade.data.message,"Métier supprimé avec succès.");
  assert.equal(runtime.DB.sqlite.prepare("SELECT COUNT(*) count FROM trades WHERE id=?").get(emptyTrade.data.id).count,0);
  assert.equal((await call(runtime,"GET","/session",owner)).data.trades.some(trade=>trade.id===emptyTrade.data.id),false);
  assert.equal((await call(runtime,"DELETE",`/trades/${emptyTrade.data.id}`,owner)).status,404);

  const usedTrade=await call(runtime,"POST","/trades",owner,{name:"Métier utilisé"});
  const member=await register(runtime,"Membre métier utilisé","member@example.ch");
  assert.equal((await call(runtime,"POST","/membership-requests",member,await form({tradeId:usedTrade.data.id,role:"mandataire"},"mandataire.pdf"))).status,201);
  assert.equal((await call(runtime,"DELETE",`/trades/${usedTrade.data.id}`,member)).status,403);
  const blockedTrade=await call(runtime,"DELETE",`/trades/${usedTrade.data.id}`,owner);
  assert.equal(blockedTrade.status,409);
  assert.equal(blockedTrade.data.code,"trade_has_dependencies");
  assert.equal(runtime.DB.sqlite.prepare("SELECT COUNT(*) count FROM trades WHERE id=?").get(usedTrade.data.id).count,1);
});

test("métiers indépendants, attribution admin et comptes de test avec identifiant Eurêka",async()=>{
  const runtime=env();
  const owner=await register(runtime,"Fael Mendi","fael@example.ch","Motdepasse1",{ownerCode:"owner-test-code"});
  const tradeA=(await call(runtime,"POST","/trades",owner,{name:"Métier A",adminName:"Ignoré",adminEmail:"ignore@example.ch"})).data;
  const tradeB=(await call(runtime,"POST","/trades",owner,{name:"Métier B"})).data;
  assert.equal(runtime.DB.sqlite.prepare("SELECT COUNT(*) count FROM admin_invitations WHERE trade_id IN (?,?)").get(tradeA.id,tradeB.id).count,0);

  const candidate=await register(runtime,"Camille Admin","camille@example.ch","Motdepasse2");
  const candidateState=(await call(runtime,"GET","/session",candidate)).data;
  assert.match(candidateState.currentUser.eurekaEmail,/^camille\.admin@eureka\.test$/);
  const assigned=await call(runtime,"POST",`/users/${candidateState.currentUser.id}/admin-trade`,owner,{tradeId:tradeA.id});
  assert.equal(assigned.status,200);
  assert.equal((await call(runtime,"GET","/session",candidate)).data.memberships[0].role,"admin_metier");
  assert.equal((await call(runtime,"GET","/session",candidate)).data.trades.some(item=>item.id===tradeB.id),false);

  const createdFreelance=await call(runtime,"POST","/member-accounts",candidate,{name:"Testeur Horloger",role:"freelance",password:"Motdepasse3"});
  assert.equal(createdFreelance.status,201);
  assert.equal(createdFreelance.data.tradeId,tradeA.id);
  assert.match(createdFreelance.data.eurekaEmail,/^testeur\.horloger@eureka\.test$/);
  const createdMandataire=await call(runtime,"POST","/member-accounts",candidate,{name:"Client Test",role:"mandataire",password:"Motdepasse4"});
  assert.equal(createdMandataire.status,201);
  const eurekaLogin=await call(runtime,"POST","/auth/login","",{email:createdFreelance.data.eurekaEmail,password:"Motdepasse3"});
  assert.equal(eurekaLogin.status,200);
  assert.equal((await call(runtime,"GET","/session",eurekaLogin.cookie)).data.memberships[0].trade_id,tradeA.id);
  assert.equal((await call(runtime,"POST","/member-accounts",eurekaLogin.cookie,{name:"Interdit",role:"freelance",password:"Motdepasse5"})).status,403);

  const invitation=await call(runtime,"POST","/admin-invitations",owner,{displayName:"Admin B",email:"admin.b@example.ch",role:"admin_metier",tradeId:tradeB.id});
  assert.equal(invitation.status,201);
  assert.equal((await call(runtime,"DELETE",`/admin-invitations/${invitation.data.id}`,candidate)).status,403);
  assert.equal((await call(runtime,"DELETE",`/admin-invitations/${invitation.data.id}`,owner)).status,200);
  assert.equal(runtime.DB.sqlite.prepare("SELECT status FROM admin_invitations WHERE id=?").get(invitation.data.id).status,"revoked");

  const ownerState=(await call(runtime,"GET","/session",owner)).data;
  const createdUser=ownerState.users.find(user=>user.id===createdFreelance.data.id);
  assert.equal(createdUser.eureka_email,createdFreelance.data.eurekaEmail);
  assert.equal(createdUser.trade_id,tradeA.id);
});

test("le sélecteur public suit les créations et suppressions de métiers",async()=>{
  const runtime=env();
  const owner=await register(runtime,"Fael Mendi","fael@example.ch","Motdepasse1",{ownerCode:"owner-test-code"});
  const before=(await call(runtime,"GET","/public/trades","")).data.trades;
  assert.ok(before.some(trade=>trade.name==="R&D horlogerie Mouvement"));
  const created=await call(runtime,"POST","/trades",owner,{name:"Métier temporaire sélecteur"});
  assert.equal(created.status,201);
  const afterCreate=(await call(runtime,"GET","/public/trades","")).data.trades;
  assert.ok(afterCreate.some(trade=>trade.id===created.data.id));
  assert.equal((await call(runtime,"DELETE",`/trades/${created.data.id}`,owner)).status,200);
  const afterDelete=(await call(runtime,"GET","/public/trades","")).data.trades;
  assert.equal(afterDelete.some(trade=>trade.id===created.data.id),false);
});
