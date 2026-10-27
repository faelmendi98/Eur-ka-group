/* eslint-disable @typescript-eslint/no-explicit-any */
import { canUploadProjectArea, classRank, invoiceTransitionAllowed, isMissionEligible } from "./policy.ts";

export interface V1Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  AUTH_USER_ID?: string;
  OWNER_BOOTSTRAP_EMAIL?: string;
  OWNER_BOOTSTRAP_TOKEN?: string;
  EUREKA_TEST_MODE?: string;
}

type Role = "freelance" | "mandataire" | "admin_metier" | "admin_eureka";
type Auth = { id: string; subject: string; email: string; name: string; globalAdmin: boolean };
type Membership = { id: string; trade_id: string; role: Exclude<Role,"admin_eureka">|"specialiste_metier"; status: string; project_class: string | null; credits: number; reserved_credits: number; rating: number };

const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const allowedProjectAreas = new Set(["cahier_des_charges","mission","documents","suivi"]);
const allowedExtensions = new Set(["doc","docx","xls","xlsx","pdf","one","onepkg","step","stp","ipt","iam","dwg","dxf","zip"]);
const maxUploadBytes = 20 * 1024 * 1024;
// Cloudflare Workers currently caps WebCrypto PBKDF2 at 100,000 iterations.
// Keep this value centralized so registration and password changes stay compatible.
const passwordIterations = 100_000;

function reply(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: jsonHeaders }); }
function fail(error: string, status: number, code = "request_rejected") { return reply({ error, code }, status); }
function id(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function cleanText(value: unknown, max = 160) { return typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0,max) : ""; }
function email(value: string) { return value.trim().toLowerCase(); }
function isClass(value: unknown): value is string { return typeof value === "string" && Object.hasOwn(classRank,value); }
function int(value: unknown, min: number, max: number) { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : null; }
function cents(value: unknown) { const n = Number(value); return Number.isInteger(n) && n >= 0 && n <= 1_000_000_000 ? n : null; }
async function body(request: Request) { try { return await request.json() as Record<string,unknown>; } catch { return null; } }
function identifierBase(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,".").replace(/^\.|\.$/g,"").slice(0,48)||"utilisateur";}
async function generateEurekaEmail(env:V1Env,displayName:string){const base=identifierBase(displayName);for(let suffix=0;suffix<1000;suffix++){const candidate=`${base}${suffix?`.${suffix+1}`:""}@eureka.test`;if(!await env.DB.prepare("SELECT 1 ok FROM users WHERE eureka_email=? COLLATE NOCASE").bind(candidate).first())return candidate;}throw new Error("eureka_identifier_exhausted");}
async function ensureEurekaEmail(env:V1Env,userId:string,displayName:string,current?:unknown){if(typeof current==="string"&&current)return current;const value=await generateEurekaEmail(env,displayName);await env.DB.prepare("UPDATE users SET eureka_email=?,updated_at=? WHERE id=? AND eureka_email IS NULL").bind(value,now(),userId).run();return (await env.DB.prepare("SELECT eureka_email FROM users WHERE id=?").bind(userId).first<{eureka_email:string}>())?.eureka_email||value;}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary=""; for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
}
function randomToken(size=32){const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return bytesToBase64Url(bytes);}
async function digest(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return bytesToBase64Url(new Uint8Array(bytes));}
async function passwordHash(password:string,salt:string,iterations=passwordIterations){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:new TextEncoder().encode(salt),iterations},key,256);
  return bytesToBase64Url(new Uint8Array(bits));
}
function validPassword(value:unknown):value is string{return typeof value==="string"&&value.length>=10&&value.length<=128&&/[A-Za-zÀ-ÿ]/.test(value)&&/\d/.test(value);}
function cookieValue(request:Request,name:string){const value=request.headers.get("cookie")||"";for(const part of value.split(";")){const [key,...rest]=part.trim().split("=");if(key===name)return decodeURIComponent(rest.join("="));}return "";}
function sessionCookie(token:string,maxAge:number){return `eureka_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
function replyWithCookie(data:unknown,status:number,cookie:string){const headers={...jsonHeaders,"set-cookie":cookie};return new Response(JSON.stringify(data),{status,headers});}
function sameOrigin(request:Request){const origin=request.headers.get("origin");return !origin||origin===new URL(request.url).origin;}
async function requestFingerprint(request:Request){const ip=request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")||"unknown";return digest(ip);}
async function logSecurity(env:V1Env,userId:string|null,eventType:string,outcome:string,request:Request,metadata?:unknown){
  await env.DB.prepare("INSERT INTO security_log (id,user_id,event_type,outcome,request_id,ip_hash,metadata_json) VALUES (?,?,?,?,?,?,?)").bind(id("sec"),userId,eventType,outcome,request.headers.get("cf-ray"),await requestFingerprint(request),metadata?JSON.stringify(metadata).slice(0,1000):null).run();
}
async function pendingAdminInvitation(env:V1Env,normalizedEmail:string,invitationCode:string){
  if(!invitationCode)return null;
  const tokenHash=await digest(invitationCode);
  return env.DB.prepare("SELECT id,trade_id,role FROM admin_invitations WHERE email=? COLLATE NOCASE AND token_hash=? AND status='pending' AND role IN ('admin_eureka','admin_metier') AND (expires_at IS NULL OR expires_at>?)").bind(normalizedEmail,tokenHash,now()).first<Record<string,unknown>>();
}
async function createSession(env:V1Env,userId:string){
  const token=randomToken();const expires=new Date(Date.now()+14*24*60*60*1000).toISOString();
  await env.DB.prepare("INSERT INTO auth_sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)").bind(id("ses"),userId,await digest(token),expires).run();
  return token;
}

async function authenticate(request: Request, env: V1Env): Promise<Auth | Response> {
  if (env.AUTH_USER_ID) {
    const row=await env.DB.prepare("SELECT id,auth_subject,email,display_name,status FROM users WHERE supabase_auth_id=?").bind(env.AUTH_USER_ID).first<Record<string,unknown>>();
    if(!row)return fail("Compte Eurêka introuvable.",403,"account_not_linked");
    if(row.status!=="active")return fail("Ce compte n’est pas actif.",403,"account_inactive");
    const globalRole=await env.DB.prepare("SELECT 1 ok FROM global_roles WHERE user_id=? AND role='admin_eureka'").bind(row.id).first();
    return {id:String(row.id),subject:String(row.auth_subject),email:String(row.email),name:String(row.display_name),globalAdmin:Boolean(globalRole)};
  }
  const token=cookieValue(request,"eureka_session");
  if(!token)return fail("Authentification requise.",401,"authentication_required");
  const tokenHash=await digest(token);
  const row=await env.DB.prepare("SELECT u.id,u.auth_subject,u.email,u.display_name,u.status,s.id session_id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?").bind(tokenHash,now()).first<Record<string,unknown>>();
  if(!row)return replyWithCookie({error:"Session expirée.",code:"authentication_required"},401,sessionCookie("",0));
  if(row.status!=="active")return replyWithCookie({error:"Ce compte n’est pas actif.",code:"account_inactive"},403,sessionCookie("",0));
  await env.DB.prepare("UPDATE auth_sessions SET last_seen_at=? WHERE id=?").bind(now(),row.session_id).run();
  const globalRole=await env.DB.prepare("SELECT 1 ok FROM global_roles WHERE user_id=? AND role='admin_eureka'").bind(row.id).first();
  return {id:String(row.id),subject:String(row.auth_subject),email:String(row.email),name:String(row.display_name),globalAdmin:Boolean(globalRole)};
}

async function handleAuth(request:Request,env:V1Env,action:string){
  if(!sameOrigin(request))return fail("Origine de la requête refusée.",403,"csrf_rejected");
  if(action==="register"&&request.method==="POST"){
    const input=await body(request);if(!input)return fail("Données invalides.",400);
    const normalizedEmail=email(cleanText(input.email,254));const displayName=cleanText(input.name,120);const password=typeof input.password==="string"?input.password:"";const ownerCode=cleanText(input.ownerCode,200);const invitationCode=cleanText(input.invitationCode,200);
    if(!normalizedEmail.includes("@")||!displayName||!validPassword(password))return fail("Nom, e-mail et mot de passe valide sont obligatoires (10 caractères, dont un chiffre).",400,"validation_error");
    const adminInvitation=invitationCode?await pendingAdminInvitation(env,normalizedEmail,invitationCode):null;
    if(invitationCode&&!adminInvitation)return fail("Le code d’invitation administrateur est invalide, expiré ou ne correspond pas à cette adresse e-mail.",403,"admin_invitation_invalid");
    const ownerEmail=email(env.OWNER_BOOTSTRAP_EMAIL||"");const configuredOwnerCode=cleanText(env.OWNER_BOOTSTRAP_TOKEN,200);const wantsOwner=Boolean(ownerEmail&&normalizedEmail===ownerEmail);
    const existing=await env.DB.prepare("SELECT u.id,ac.user_id credential_user_id,gr.role global_role FROM users u LEFT JOIN account_credentials ac ON ac.user_id=u.id LEFT JOIN global_roles gr ON gr.user_id=u.id AND gr.role='admin_eureka' WHERE u.email=? COLLATE NOCASE").bind(normalizedEmail).first<Record<string,unknown>>();
    if(wantsOwner){
      if(!configuredOwnerCode||await digest(ownerCode)!==await digest(configuredOwnerCode))return fail("Le code d’activation propriétaire est invalide.",403,"owner_code_invalid");
      const globalAdminCount=await env.DB.prepare("SELECT COUNT(*) count FROM global_roles WHERE role='admin_eureka'").first<{count:number}>();
      const claimsExistingOwner=Boolean(existing?.global_role==="admin_eureka"&&!existing?.credential_user_id);
      if(Number(globalAdminCount?.count||0)>0&&!claimsExistingOwner)return fail("L’activation propriétaire initiale a déjà été utilisée.",409,"owner_bootstrap_closed");
    }
    if(existing?.credential_user_id)return fail("Un compte existe déjà avec cette adresse.",409,"duplicate_account");
    if(existing&&!wantsOwner)return fail("Cette adresse est déjà associée à un compte.",409,"duplicate_account");
    const userId=existing?String(existing.id):id("usr");const salt=randomToken(18);const hash=await passwordHash(password,salt);const eurekaEmail=await generateEurekaEmail(env,displayName);
    if(existing){
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET display_name=?,eureka_email=COALESCE(eureka_email,?),status='active',updated_at=? WHERE id=?").bind(displayName,eurekaEmail,now(),userId),
        env.DB.prepare("INSERT INTO account_credentials (user_id,password_hash,password_salt,password_iterations) VALUES (?,?,?,?)").bind(userId,hash,salt,passwordIterations)
      ]);
    }else{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users (id,auth_subject,email,eureka_email,display_name,email_verified,last_login_at) VALUES (?,?,?,?,?,0,?)").bind(userId,`eureka:${userId}`,normalizedEmail,eurekaEmail,displayName,now()),
        env.DB.prepare("INSERT INTO profiles (user_id) VALUES (?)").bind(userId),
        env.DB.prepare("INSERT INTO account_credentials (user_id,password_hash,password_salt,password_iterations) VALUES (?,?,?,?)").bind(userId,hash,salt,passwordIterations)
      ]);
    }
    if(wantsOwner)await env.DB.prepare("INSERT OR IGNORE INTO global_roles (user_id,role) VALUES (?,'admin_eureka')").bind(userId).run();
    const token=await createSession(env,userId);await logSecurity(env,userId,"account.registered","success",request,{owner:wantsOwner});
    return replyWithCookie({ok:true,userId,eurekaEmail,owner:wantsOwner,adminApprovalPending:Boolean(adminInvitation)},201,sessionCookie(token,14*24*60*60));
  }
  if(action==="login"&&request.method==="POST"){
    const input=await body(request);if(!input)return fail("Données invalides.",400);
    const normalizedEmail=email(cleanText(input.email,254));const password=typeof input.password==="string"?input.password:"";const emailHash=await digest(normalizedEmail);const ipHash=await requestFingerprint(request);const since=new Date(Date.now()-15*60*1000).toISOString();
    const attempts=await env.DB.prepare("SELECT COUNT(*) count FROM auth_attempts WHERE outcome='failure' AND created_at>? AND (email_hash=? OR ip_hash=?)").bind(since,emailHash,ipHash).first<{count:number}>();
    if(Number(attempts?.count||0)>=5){await env.DB.prepare("INSERT INTO auth_attempts (id,email_hash,ip_hash,outcome) VALUES (?,?,?,'blocked')").bind(id("att"),emailHash,ipHash).run();return fail("Trop de tentatives. Réessayez dans 15 minutes.",429,"rate_limited");}
    const row=await env.DB.prepare("SELECT u.id,u.status,u.display_name,u.eureka_email,ac.password_hash,ac.password_salt,ac.password_iterations FROM users u JOIN account_credentials ac ON ac.user_id=u.id WHERE u.email=? COLLATE NOCASE OR u.eureka_email=? COLLATE NOCASE").bind(normalizedEmail,normalizedEmail).first<Record<string,unknown>>();
    const candidateHash=await passwordHash(password,row?String(row.password_salt):"invalid-account-salt",row?Number(row.password_iterations):passwordIterations);
    const valid=Boolean(row&&row.status==="active"&&candidateHash===row.password_hash);
    await env.DB.prepare("INSERT INTO auth_attempts (id,email_hash,ip_hash,outcome) VALUES (?,?,?,?)").bind(id("att"),emailHash,ipHash,valid?"success":"failure").run();
    if(!valid){await logSecurity(env,row?String(row.id):null,"account.login","failure",request);return fail("Adresse e-mail ou mot de passe incorrect.",401,"invalid_credentials");}
    await ensureEurekaEmail(env,String(row!.id),String(row!.display_name),row!.eureka_email);await env.DB.prepare("UPDATE users SET last_login_at=?,updated_at=? WHERE id=?").bind(now(),now(),row!.id).run();
    const token=await createSession(env,String(row!.id));await logSecurity(env,String(row!.id),"account.login","success",request);
    return replyWithCookie({ok:true},200,sessionCookie(token,14*24*60*60));
  }
  if(action==="logout"&&request.method==="POST"){
    const token=cookieValue(request,"eureka_session");if(token)await env.DB.prepare("UPDATE auth_sessions SET revoked_at=? WHERE token_hash=?").bind(now(),await digest(token)).run();
    return replyWithCookie({ok:true},200,sessionCookie("",0));
  }
  if(action==="forgot-password"&&request.method==="POST"){
    const input=await body(request);const normalizedEmail=email(cleanText(input?.email,254));const row=await env.DB.prepare("SELECT id FROM users WHERE (email=? COLLATE NOCASE OR eureka_email=? COLLATE NOCASE) AND status='active'").bind(normalizedEmail,normalizedEmail).first<{id:string}>();
    let resetCode:string|undefined;
    if(row){resetCode=randomToken(18);await env.DB.batch([env.DB.prepare("UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL").bind(now(),row.id),env.DB.prepare("INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)").bind(id("rst"),row.id,await digest(resetCode),new Date(Date.now()+30*60*1000).toISOString())]);await logSecurity(env,row.id,"password.reset_requested","success",request);}
    return reply({ok:true,message:"Si ce compte existe, une procédure de réinitialisation a été créée.",...(env.EUREKA_TEST_MODE==="true"&&resetCode?{resetCode}:{})});
  }
  if(action==="reset-password"&&request.method==="POST"){
    const input=await body(request);const normalizedEmail=email(cleanText(input?.email,254));const code=cleanText(input?.code,200);const password=typeof input?.password==="string"?input.password:"";
    if(!code||!validPassword(password))return fail("Code et nouveau mot de passe valide obligatoires.",400);
    const tokenHash=await digest(code);const row=await env.DB.prepare("SELECT pr.id,pr.user_id FROM password_reset_tokens pr JOIN users u ON u.id=pr.user_id WHERE pr.token_hash=? AND pr.used_at IS NULL AND pr.expires_at>? AND (u.email=? COLLATE NOCASE OR u.eureka_email=? COLLATE NOCASE)").bind(tokenHash,now(),normalizedEmail,normalizedEmail).first<{id:string;user_id:string}>();
    if(!row)return fail("Le code est invalide ou expiré.",400,"invalid_reset_code");
    const salt=randomToken(18),hash=await passwordHash(password,salt);await env.DB.batch([env.DB.prepare("UPDATE account_credentials SET password_hash=?,password_salt=?,password_iterations=?,password_updated_at=? WHERE user_id=?").bind(hash,salt,passwordIterations,now(),row.user_id),env.DB.prepare("UPDATE password_reset_tokens SET used_at=? WHERE id=?").bind(now(),row.id),env.DB.prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(now(),row.user_id)]);
    await logSecurity(env,row.user_id,"password.reset","success",request);return reply({ok:true});
  }
  return fail("Méthode non autorisée.",405);
}

async function memberships(env: V1Env, userId: string) {
  const rows=(await env.DB.prepare("SELECT id,trade_id,role,status,project_class,credits,reserved_credits,rating FROM trade_memberships WHERE user_id=? AND status='active' ORDER BY CASE WHEN role IN ('admin_metier','specialiste_metier') THEN 0 WHEN role='freelance' THEN 1 WHEN role='mandataire' THEN 2 ELSE 3 END, created_at").bind(userId).all<Membership>()).results;
  return rows.map(row=>row.role==="specialiste_metier"?{...row,role:"admin_metier" as const}:row);
}
async function membership(env: V1Env, userId: string, tradeId: string, roles?: string[]) {
  const all = await memberships(env,userId);
  return all.find(m => m.trade_id === tradeId && (!roles || roles.includes(m.role))) || null;
}
async function requireTradeRole(env: V1Env, auth: Auth, tradeId: string, roles: string[]) {
  if (auth.globalAdmin) return { id:"global",trade_id:tradeId,role:"admin_eureka",status:"active",project_class:null,credits:0,reserved_credits:0,rating:0 } as Membership;
  return membership(env,auth.id,tradeId,roles);
}
async function audit(env: V1Env, auth: Auth, action: string, targetType: string, targetId: string | null, tradeId: string | null, metadata?: unknown) {
  await env.DB.prepare("INSERT INTO admin_audit_log (id,trade_id,actor_user_id,action,target_type,target_id,metadata_json) VALUES (?,?,?,?,?,?,?)")
    .bind(id("aud"),tradeId,auth.id,action,targetType,targetId,metadata ? JSON.stringify(metadata).slice(0,4000) : null).run();
}
async function notify(env: V1Env, userId: string, tradeId: string | null, kind: string, title: string, message: string, path?: string) {
  await env.DB.prepare("INSERT INTO notifications (id,trade_id,user_id,kind,title,message,target_path) VALUES (?,?,?,?,?,?,?)")
    .bind(id("not"),tradeId,userId,kind,title,message,path || null).run();
}
async function tradeAdminUsers(env: V1Env, tradeId: string) {
  return (await env.DB.prepare("SELECT tm.user_id FROM trade_memberships tm WHERE tm.trade_id=? AND tm.role='admin_metier' AND tm.status='active'").bind(tradeId).all<{user_id:string}>()).results;
}

async function sessionState(env: V1Env, auth: Auth) {
  const ownUser=await env.DB.prepare("SELECT eureka_email FROM users WHERE id=?").bind(auth.id).first<{eureka_email:string|null}>();
  const ownEurekaEmail=await ensureEurekaEmail(env,auth.id,auth.name,ownUser?.eureka_email);
  const ownMemberships = await memberships(env,auth.id);
  const tradeIds = auth.globalAdmin ? [] : ownMemberships.map(m=>m.trade_id);
  const where = auth.globalAdmin ? "1=1" : tradeIds.length ? `id IN (${tradeIds.map(()=>"?").join(",")})` : "0=1";
  const trades = ownMemberships.length||auth.globalAdmin ? (await env.DB.prepare(`SELECT id,name,status,created_at FROM trades WHERE ${where} AND status!='archived' ORDER BY name`).bind(...tradeIds).all()).results : (await env.DB.prepare("SELECT id,name,status,created_at FROM trades WHERE status='active' ORDER BY name").all()).results;
  let users: unknown[] = [];
  if (auth.globalAdmin) {
    const identifiers=(await env.DB.prepare("SELECT id,display_name,eureka_email FROM users ORDER BY created_at").all<{id:string;display_name:string;eureka_email:string|null}>()).results;
    for(const user of identifiers)await ensureEurekaEmail(env,user.id,user.display_name,user.eureka_email);
    users = (await env.DB.prepare("SELECT u.id,u.display_name,u.email,u.eureka_email,u.status,tm.id membership_id,COALESCE(tm.trade_id,'all-trades') trade_id,CASE WHEN gr.role='admin_eureka' THEN 'Tous les métiers' WHEN t.name IS NOT NULL THEN t.name ELSE 'Adhésion en attente' END trade_name,COALESCE(tm.role,gr.role,'pending') role,tm.project_class,tm.credits,tm.reserved_credits,tm.rating FROM users u LEFT JOIN trade_memberships tm ON tm.user_id=u.id AND tm.status='active' LEFT JOIN trades t ON t.id=tm.trade_id LEFT JOIN global_roles gr ON gr.user_id=u.id AND gr.role='admin_eureka' ORDER BY u.display_name").all()).results;
  } else if (tradeIds.length) {
    users = (await env.DB.prepare(`SELECT u.id,u.display_name,u.email,u.eureka_email,u.status,tm.id membership_id,tm.trade_id,t.name trade_name,tm.role,tm.project_class,tm.credits,tm.reserved_credits,tm.rating FROM trade_memberships tm JOIN users u ON u.id=tm.user_id JOIN trades t ON t.id=tm.trade_id WHERE tm.trade_id IN (${tradeIds.map(()=>"?").join(",")}) AND tm.status!='archived' ORDER BY u.display_name`).bind(...tradeIds).all()).results;
  }
  let requests = auth.globalAdmin ? [] : tradeIds.length ? (await env.DB.prepare(`SELECT mr.*,u.display_name,u.email,t.name trade_name FROM membership_requests mr JOIN users u ON u.id=mr.user_id JOIN trades t ON t.id=mr.trade_id WHERE mr.trade_id IN (${tradeIds.map(()=>"?").join(",")}) AND mr.status IN ('pending','needs_information') ORDER BY mr.created_at DESC`).bind(...tradeIds).all()).results : (await env.DB.prepare("SELECT mr.*,u.display_name,u.email,t.name trade_name FROM membership_requests mr JOIN users u ON u.id=mr.user_id JOIN trades t ON t.id=mr.trade_id WHERE mr.user_id=? AND mr.status IN ('pending','needs_information') ORDER BY mr.created_at DESC").bind(auth.id).all()).results;
  const pendingAdmin=auth.globalAdmin?null:await env.DB.prepare("SELECT ai.id,ai.role,ai.trade_id,t.name trade_name FROM admin_invitations ai LEFT JOIN trades t ON t.id=ai.trade_id WHERE ai.email=? COLLATE NOCASE AND ai.status='pending' AND ai.role IN ('admin_eureka','admin_metier') ORDER BY ai.created_at DESC LIMIT 1").bind(auth.email).first();
  const adminInvitations=auth.globalAdmin?(await env.DB.prepare("SELECT ai.id,ai.display_name,ai.email,CASE WHEN ai.role='specialiste_metier' THEN 'admin_metier' ELSE ai.role END role,ai.trade_id,t.name trade_name,ai.status,ai.created_at,COALESCE((SELECT u.id FROM users u WHERE ai.email IS NOT NULL AND u.email=ai.email COLLATE NOCASE LIMIT 1),(SELECT u.id FROM users u WHERE lower(trim(u.display_name))=lower(trim(ai.display_name)) AND (SELECT COUNT(*) FROM users ux WHERE lower(trim(ux.display_name))=lower(trim(ai.display_name)))=1 LIMIT 1)) account_user_id FROM admin_invitations ai LEFT JOIN trades t ON t.id=ai.trade_id WHERE ai.status IN ('pending','awaiting_email') ORDER BY ai.created_at DESC").all()).results:[];
  const notifications = (await env.DB.prepare("SELECT id,kind,title,message,target_path,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(auth.id).all()).results;
  const scope = auth.globalAdmin ? "1=1" : tradeIds.length ? `trade_id IN (${tradeIds.map(()=>"?").join(",")})` : "0=1";
  const scopeBindings = auth.globalAdmin ? [] : tradeIds;
  let quoteRequests = (await env.DB.prepare(`SELECT * FROM quote_requests WHERE ${scope} ORDER BY created_at DESC`).bind(...scopeBindings).all()).results as Record<string,unknown>[];
  let quotes = (await env.DB.prepare(`SELECT q.*,qr.mandataire_membership_id,qr.personal_number FROM quotes q JOIN quote_requests qr ON qr.id=q.quote_request_id WHERE ${scope.replaceAll("trade_id","q.trade_id")} ORDER BY q.created_at DESC`).bind(...scopeBindings).all()).results as Record<string,unknown>[];
  let missions = (await env.DB.prepare(`SELECT * FROM missions WHERE ${scope} ORDER BY created_at DESC`).bind(...scopeBindings).all()).results as Record<string,unknown>[];
  let applications = (await env.DB.prepare(`SELECT a.*,u.id user_id,u.display_name,tm.project_class,tm.credits,tm.rating FROM applications a JOIN trade_memberships tm ON tm.id=a.freelancer_membership_id JOIN users u ON u.id=tm.user_id WHERE ${scope.replaceAll("trade_id","a.trade_id")} ORDER BY a.created_at`).bind(...scopeBindings).all()).results as Record<string,unknown>[];
  let projects = (await env.DB.prepare(`SELECT * FROM projects WHERE ${scope} ORDER BY created_at DESC`).bind(...scopeBindings).all()).results as Record<string,unknown>[];
  let invoices = (await env.DB.prepare(`SELECT i.*,p.title project_title FROM invoices i JOIN projects p ON p.id=i.project_id WHERE ${scope.replaceAll("trade_id","i.trade_id")} ORDER BY i.created_at DESC`).bind(...scopeBindings).all()).results as Record<string,unknown>[];
  let tradeSettings = (await env.DB.prepare(`SELECT * FROM trade_settings WHERE ${scope} AND status!='archived' ORDER BY setting_key`).bind(...scopeBindings).all()).results as Record<string,unknown>[];
  let milestones = (await env.DB.prepare(`SELECT * FROM milestones WHERE ${scope} ORDER BY position,created_at`).bind(...scopeBindings).all()).results as Record<string,unknown>[];
  let shareFolders = (await env.DB.prepare(`SELECT * FROM share_folders WHERE ${scope} AND status='active' ORDER BY created_at`).bind(...scopeBindings).all()).results as Record<string,unknown>[];
  let shareDocuments = (await env.DB.prepare(`SELECT id,trade_id,share_folder_id,area,original_name,mime_type,size_bytes,visibility,created_at FROM documents WHERE ${scope} AND share_folder_id IS NOT NULL AND status='active' ORDER BY created_at`).bind(...scopeBindings).all()).results.map(row=>({...row,download_url:`/api/v1/documents/${row.id}/download`}));
  let workflowDocuments = (await env.DB.prepare(`SELECT id,trade_id,quote_request_id,quote_id,membership_request_id,area,original_name,mime_type,size_bytes,created_at FROM documents WHERE ${scope} AND (quote_request_id IS NOT NULL OR quote_id IS NOT NULL OR membership_request_id IS NOT NULL) AND status='active' ORDER BY created_at`).bind(...scopeBindings).all()).results.map(row=>({...row,download_url:`/api/v1/documents/${row.id}/download`}));
  const primary=ownMemberships[0];
  if(!auth.globalAdmin&&primary){
    if(primary.role==="freelance"){
      users=users.filter((user:any)=>user.id===auth.id);requests=[];quoteRequests=[];quotes=[];
      missions=missions.filter((mission:any)=>mission.status==="published"&&classRank[String(primary.project_class||"D")]>=classRank[String(mission.required_class)]&&primary.credits-primary.reserved_credits>=Number(mission.required_credits));
      applications=applications.filter((application:any)=>application.freelancer_membership_id===primary.id);projects=projects.filter((project:any)=>project.freelancer_membership_id===primary.id);invoices=[];tradeSettings=[];shareFolders=shareFolders.filter((folder:any)=>folder.audience==="freelance");const folderIds=new Set(shareFolders.map((folder:any)=>folder.id));shareDocuments=shareDocuments.filter((doc:any)=>folderIds.has(doc.share_folder_id));workflowDocuments=[];
    }else if(primary.role==="mandataire"){
      requests=[];quoteRequests=quoteRequests.filter((item:any)=>item.mandataire_membership_id===primary.id);const requestIds=new Set(quoteRequests.map((item:any)=>item.id));quotes=quotes.filter((item:any)=>requestIds.has(item.quote_request_id));missions=missions.filter((mission:any)=>mission.mandataire_membership_id===primary.id);const missionIds=new Set(missions.map((mission:any)=>mission.id));applications=applications.filter((application:any)=>missionIds.has(application.mission_id));const candidateIds=new Set(applications.map((application:any)=>application.user_id));users=users.filter((user:any)=>user.id===auth.id||candidateIds.has(user.id));projects=projects.filter((project:any)=>project.mandataire_membership_id===primary.id);invoices=[];tradeSettings=[];shareFolders=shareFolders.filter((folder:any)=>folder.audience==="mandataire");const folderIds=new Set(shareFolders.map((folder:any)=>folder.id));shareDocuments=shareDocuments.filter((doc:any)=>folderIds.has(doc.share_folder_id));workflowDocuments=workflowDocuments.filter((doc:any)=>requestIds.has(doc.quote_request_id)||quotes.some((quote:any)=>quote.id===doc.quote_id));
    }else if(primary.role!=="admin_metier"){
      requests=[];quoteRequests=[];quotes=[];missions=[];applications=[];projects=[];invoices=[];tradeSettings=[];shareFolders=[];shareDocuments=[];workflowDocuments=[];
    }
  }
  const visibleProjectIds=new Set(projects.map((project:any)=>project.id));milestones=milestones.filter((milestone:any)=>visibleProjectIds.has(milestone.project_id));
  return { currentUser:{ id:auth.id,email:auth.email,eurekaEmail:ownEurekaEmail,name:auth.name,globalAdmin:auth.globalAdmin }, memberships:ownMemberships,trades,users,membershipRequests:requests,pendingAdminInvitation:pendingAdmin,adminInvitations,quoteRequests,quotes,missions,applications,projects,milestones,invoices,tradeSettings,shareFolders,shareDocuments,workflowDocuments,notifications };
}

async function handleTradeSettings(request:Request,env:V1Env,auth:Auth,settingId?:string,action?:string){
  if(request.method==="POST"&&!settingId){const input=await body(request);if(!input)return fail("Données invalides.",400);const tradeId=cleanText(input.tradeId,80),key=cleanText(input.key,100),value=cleanText(input.value,4000);const member=await requireTradeRole(env,auth,tradeId,["admin_metier"]);if(!member)return fail("Accès refusé.",403);if(!key||!value)return fail("Nom et valeur obligatoires.",400);const setting=id("set");try{await env.DB.prepare("INSERT INTO trade_settings (id,trade_id,setting_key,value_json,status,created_by) VALUES (?,?,?,?,?,?) ON CONFLICT(trade_id,setting_key) DO UPDATE SET value_json=excluded.value_json,status=excluded.status,updated_at=CURRENT_TIMESTAMP").bind(setting,tradeId,key,JSON.stringify({value}),input.submit?"submitted":"draft",auth.id).run();}catch{return fail("Paramètre impossible à enregistrer.",409)}await audit(env,auth,"trade_setting.saved","trade_setting",setting,tradeId,{key,status:input.submit?"submitted":"draft"});return reply({id:setting,status:input.submit?"submitted":"draft"},201);}
  if(request.method==="PATCH"&&settingId&&action==="validate"){const row=await env.DB.prepare("SELECT * FROM trade_settings WHERE id=?").bind(settingId).first<Record<string,unknown>>();if(!row)return fail("Paramètre introuvable.",404);if(!(await requireTradeRole(env,auth,String(row.trade_id),["admin_metier"])))return fail("Accès refusé.",403);await env.DB.prepare("UPDATE trade_settings SET status='validated',validated_by=?,updated_at=? WHERE id=? AND status='submitted'").bind(auth.id,now(),settingId).run();await audit(env,auth,"trade_setting.validated","trade_setting",settingId,String(row.trade_id));return reply({id:settingId,status:"validated"});}
  return fail("Méthode non autorisée.",405);
}

async function handleShareFolders(request: Request, env: V1Env, auth: Auth) {
  if(request.method!=="POST")return fail("Méthode non autorisée.",405);const input=await body(request);if(!input)return fail("Données invalides.",400);
  const tradeId=cleanText(input.tradeId,80),audience=cleanText(input.audience,30),name=cleanText(input.name,120);
  if(!["freelance","mandataire"].includes(audience)||!name)return fail("Dossier invalide.",400);
  if(!(await requireTradeRole(env,auth,tradeId,["admin_metier"])))return fail("Accès refusé.",403,"forbidden");
  const folderId=id("fld");try{await env.DB.prepare("INSERT INTO share_folders (id,trade_id,audience,name,created_by) VALUES (?,?,?,?,?)").bind(folderId,tradeId,audience,name,auth.id).run();}catch{return fail("Un dossier porte déjà ce nom.",409,"duplicate_folder");}
  await audit(env,auth,"share_folder.created","share_folder",folderId,tradeId,{audience,name});return reply({id:folderId,tradeId,audience,name},201);
}

async function handleTrades(request: Request, env: V1Env, auth: Auth) {
  if (!auth.globalAdmin) return fail("Accès réservé à l’Admin Eurêka.",403,"forbidden");
  if (request.method === "GET") return reply({ trades:(await env.DB.prepare("SELECT id,name,status,created_at FROM trades WHERE status!='archived' ORDER BY name").all()).results });
  if (request.method === "DELETE") {
    const tradeId=new URL(request.url).pathname.split("/").filter(Boolean).at(-1)||"";
    const trade=await env.DB.prepare("SELECT id,name FROM trades WHERE id=?").bind(tradeId).first<Record<string,unknown>>();
    if(!trade)return fail("Métier introuvable.",404,"trade_not_found");
    const dependencies:{label:string;table:string;where?:string}[]=[
      {label:"utilisateurs",table:"trade_memberships"},{label:"demandes d’adhésion",table:"membership_requests"},
      {label:"paramètres",table:"trade_settings"},{label:"règles de classe",table:"class_rules"},{label:"règles de crédits",table:"credit_rules"},
      {label:"compétences",table:"skills"},{label:"demandes de devis",table:"quote_requests"},{label:"devis",table:"quotes"},
      {label:"missions",table:"missions"},{label:"postulations",table:"applications"},{label:"projets",table:"projects"},
      {label:"attributions",table:"assignments"},{label:"jalons",table:"milestones"},{label:"séances",table:"followup_sessions"},
      {label:"dossiers partagés",table:"share_folders"},{label:"documents",table:"documents"},{label:"validations",table:"validations"},
      {label:"évaluations",table:"ratings"},{label:"mouvements de crédits",table:"credit_movements"},{label:"notifications",table:"notifications"},
      {label:"historique projets",table:"project_events"},{label:"factures",table:"invoices"},
      {label:"invitations administratives actives",table:"admin_invitations",where:"status IN ('accepted')"}
    ];
    const blockers:{label:string;count:number}[]=[];
    for(const dependency of dependencies){const row=await env.DB.prepare(`SELECT COUNT(*) count FROM ${dependency.table} WHERE trade_id=?${dependency.where?` AND ${dependency.where}`:""}`).bind(tradeId).first<{count:number}>();const count=Number(row?.count||0);if(count)blockers.push({label:dependency.label,count});}
    if(blockers.length)return reply({error:`Impossible de supprimer ce métier : ${blockers.map(item=>`${item.count} ${item.label}`).join(", ")}.`,code:"trade_has_dependencies",dependencies:blockers},409);
    try{
      await env.DB.batch([
        env.DB.prepare("DELETE FROM admin_invitations WHERE trade_id=? AND status IN ('awaiting_email','pending','expired','revoked')").bind(tradeId),
        env.DB.prepare("UPDATE admin_audit_log SET trade_id=NULL WHERE trade_id=?").bind(tradeId),
        env.DB.prepare("DELETE FROM trades WHERE id=?").bind(tradeId)
      ]);
    }catch{return fail("Impossible de supprimer ce métier car il est encore utilisé.",409,"trade_has_dependencies");}
    await audit(env,auth,"trade.deleted","trade",tradeId,null,{name:trade.name});
    return reply({id:tradeId,deleted:true,message:"Métier supprimé avec succès."});
  }
  if (request.method !== "POST") return fail("Méthode non autorisée.",405);
  const input = await body(request); if (!input) return fail("Données invalides.",400);
  const name = cleanText(input.name,120);
  if (!name) return fail("Le nom du métier est obligatoire.",400,"validation_error");
  const tradeId = id("trd");
  try { await env.DB.prepare("INSERT INTO trades (id,name) VALUES (?,?)").bind(tradeId,name).run(); }
  catch { return fail("Ce métier existe déjà.",409,"duplicate_trade"); }
  await audit(env,auth,"trade.created","trade",tradeId,tradeId,{name});
  return reply({ id:tradeId,name,empty:true },201);
}

async function handleAdminInvitations(request:Request,env:V1Env,auth:Auth,invitationId?:string,action?:string){
  if(!auth.globalAdmin)return fail("Accès réservé à l’Admin Eurêka.",403,"forbidden");
  if(request.method==="POST"&&!invitationId){
    const input=await body(request);if(!input)return fail("Données invalides.",400);
    const role=cleanText(input.role,40),displayName=cleanText(input.displayName,120),targetEmail=email(cleanText(input.email,254)),tradeId=cleanText(input.tradeId,80);
    if(!["admin_eureka","admin_metier"].includes(role)||!displayName||!targetEmail.includes("@")||(role==="admin_metier"&&!tradeId))return fail("Invitation incomplète.",400);
    if(role==="admin_metier"&&!await env.DB.prepare("SELECT id FROM trades WHERE id=? AND status='active'").bind(tradeId).first())return fail("Métier introuvable.",404);
    const duplicate=await env.DB.prepare("SELECT id FROM admin_invitations WHERE email=? COLLATE NOCASE AND role=? AND status IN ('pending','awaiting_email')").bind(targetEmail,role).first();
    if(duplicate)return fail("Une invitation administrative est déjà en attente pour cette adresse.",409,"duplicate_invitation");
    const invitation=id("inv"),invitationCode=randomToken(18);
    await env.DB.prepare("INSERT INTO admin_invitations (id,trade_id,email,display_name,role,token_hash,status,invited_by,expires_at) VALUES (?,?,?,?,?,?,'pending',?,?)").bind(invitation,role==="admin_eureka"?null:tradeId,targetEmail,displayName,role,await digest(invitationCode),auth.id,new Date(Date.now()+7*24*60*60*1000).toISOString()).run();
    await audit(env,auth,"admin.invited","admin_invitation",invitation,role==="admin_eureka"?null:tradeId,{role,email:targetEmail});
    return reply({id:invitation,status:"pending",...(env.EUREKA_TEST_MODE==="true"?{invitationCode}:{})},201);
  }
  if(request.method==="DELETE"&&invitationId&&!action){
    const invitation=await env.DB.prepare("SELECT id,trade_id,status FROM admin_invitations WHERE id=?").bind(invitationId).first<Record<string,unknown>>();
    if(!invitation)return fail("Invitation introuvable.",404,"invitation_not_found");
    if(!["pending","awaiting_email"].includes(String(invitation.status)))return fail("Cette invitation ne peut plus être supprimée.",409,"invalid_transition");
    await env.DB.prepare("UPDATE admin_invitations SET status='revoked',updated_at=? WHERE id=? AND status IN ('pending','awaiting_email')").bind(now(),invitationId).run();
    await audit(env,auth,"admin.invitation_deleted","admin_invitation",invitationId,invitation.trade_id?String(invitation.trade_id):null);
    return reply({id:invitationId,deleted:true,message:"Invitation supprimée avec succès."});
  }
  if(request.method==="PATCH"&&invitationId&&action==="decision"){
    const input=await body(request);if(!input)return fail("Données invalides.",400);
    const decision=cleanText(input.decision,20);if(!["accepted","rejected"].includes(decision))return fail("Décision invalide.",400);
    const invitation=await env.DB.prepare("SELECT * FROM admin_invitations WHERE id=?").bind(invitationId).first<Record<string,unknown>>();
    if(!invitation)return fail("Invitation introuvable.",404);
    if(!["pending","awaiting_email"].includes(String(invitation.status)))return fail("Cette invitation a déjà été traitée.",409,"invalid_transition");
    if(decision==="rejected"){
      await env.DB.prepare("UPDATE admin_invitations SET status='revoked',updated_at=? WHERE id=? AND status IN ('pending','awaiting_email')").bind(now(),invitationId).run();
      await audit(env,auth,"admin.rejected","admin_invitation",invitationId,invitation.trade_id?String(invitation.trade_id):null,{role:invitation.role});
      return reply({id:invitationId,status:"rejected"});
    }
    const requestedUserId=cleanText(input.userId,100);
    const target=requestedUserId?await env.DB.prepare("SELECT id,email,display_name FROM users WHERE id=? AND status='active'").bind(requestedUserId).first<Record<string,unknown>>():await env.DB.prepare("SELECT id,email,display_name FROM users WHERE email=? COLLATE NOCASE AND status='active'").bind(invitation.email).first<Record<string,unknown>>();
    if(!target)return fail("Le compte invité n’a pas encore été créé.",409,"invited_account_missing");
    if(String(target.id)===auth.id)return fail("Vous ne pouvez pas valider votre propre compte administratif.",409,"self_approval_forbidden");
    const emailMatches=Boolean(invitation.email&&email(String(target.email))===email(String(invitation.email)));
    const nameMatches=cleanText(target.display_name,120).toLocaleLowerCase("fr")===cleanText(invitation.display_name,120).toLocaleLowerCase("fr");
    if(!emailMatches&&!nameMatches)return fail("Ce compte ne correspond pas à l’invitation.",403,"invitation_identity_mismatch");
    const normalizedRole=invitation.role==="specialiste_metier"?"admin_metier":String(invitation.role);
    if(!["admin_eureka","admin_metier"].includes(normalizedRole))return fail("Rôle administratif invalide.",409);
    if(normalizedRole==="admin_metier"&&(!invitation.trade_id||!await env.DB.prepare("SELECT id FROM trades WHERE id=? AND status='active'").bind(invitation.trade_id).first()))return fail("Le métier de cet Admin métier est introuvable.",409);
    const alreadyAdmin=normalizedRole==="admin_eureka"?await env.DB.prepare("SELECT 1 ok FROM global_roles WHERE user_id=? AND role='admin_eureka'").bind(target.id).first():await env.DB.prepare("SELECT 1 ok FROM trade_memberships WHERE user_id=? AND role IN ('admin_metier','specialiste_metier') AND status='active'").bind(target.id).first();
    if(alreadyAdmin)return fail("Ce compte possède déjà un rôle administratif.",409,"admin_role_exists");
    const statements=[];
    if(normalizedRole==="admin_eureka")statements.push(env.DB.prepare("INSERT INTO global_roles (user_id,role) VALUES (?,'admin_eureka')").bind(target.id));
    else statements.push(env.DB.prepare("INSERT INTO trade_memberships (id,trade_id,user_id,role,status,project_class,credits) VALUES (?,?,?,'admin_metier','active',NULL,0)").bind(id("mem"),invitation.trade_id,target.id));
    statements.push(env.DB.prepare("UPDATE admin_invitations SET status='accepted',role=?,updated_at=? WHERE id=? AND status IN ('pending','awaiting_email')").bind(normalizedRole,now(),invitationId));
    statements.push(env.DB.prepare("UPDATE membership_requests SET status='withdrawn',decision_reason='Compte converti en compte administratif',decided_by=?,decided_at=?,updated_at=? WHERE user_id=? AND status IN ('pending','needs_information')").bind(auth.id,now(),now(),target.id));
    statements.push(env.DB.prepare("INSERT INTO notifications (id,trade_id,user_id,kind,title,message,target_path) VALUES (?,?,?,?,?,?,?)").bind(id("not"),normalizedRole==="admin_metier"?invitation.trade_id:null,target.id,"admin_account_accepted","Compte administrateur accepté",normalizedRole==="admin_eureka"?"Votre compte Admin global est maintenant actif.":"Votre compte Admin métier est maintenant actif.","/"));
    await env.DB.batch(statements);
    await audit(env,auth,"admin.accepted","admin_invitation",invitationId,normalizedRole==="admin_metier"?String(invitation.trade_id):null,{role:normalizedRole,userId:target.id});
    return reply({id:invitationId,status:"accepted",userId:target.id,role:normalizedRole});
  }
  return fail("Méthode non autorisée.",405);
}

async function handleMembershipRequests(request: Request, env: V1Env, auth: Auth, requestId?: string, action?: string) {
  if (request.method === "POST" && !requestId) {
    const isMultipart=request.headers.get("content-type")?.includes("multipart/form-data");const form=isMultipart?await request.formData():null;const input=isMultipart?null:await body(request); if(!form&&!input)return fail("Données invalides.",400);
    const tradeId=cleanText(form?.get("tradeId")??input?.tradeId,80); const requestedRole=cleanText(form?.get("role")??input?.role,30); const message=cleanText(form?.get("message")??input?.message,1500);const file=form?.get("file");
    if(!["freelance","mandataire"].includes(requestedRole))return fail("Type de compte invalide.",400);
    if(!(file instanceof File))return fail("Le document d’adhésion rempli est obligatoire.",400,"document_required");
    const trade=await env.DB.prepare("SELECT id FROM trades WHERE id=? AND status='active'").bind(tradeId).first(); if(!trade)return fail("Métier introuvable.",404);
    const existing=await env.DB.prepare("SELECT id FROM trade_memberships WHERE trade_id=? AND user_id=? AND status IN ('active','pending')").bind(tradeId,auth.id).first(); if(existing)return fail("Vous appartenez déjà à ce métier.",409,"duplicate_membership");
    const requestIdNew=id("memreq");
    try{await env.DB.prepare("INSERT INTO membership_requests (id,trade_id,user_id,requested_role,message) VALUES (?,?,?,?,?)").bind(requestIdNew,tradeId,auth.id,requestedRole,message||null).run();}
    catch{return fail("Une demande est déjà en attente.",409,"duplicate_request");}
    if(file instanceof File){const stored=await storeWorkflowFile(env,auth,file,{tradeId,area:"adhesion",visibility:"membership_request",membershipRequestId:requestIdNew});if(stored instanceof Response){await env.DB.prepare("DELETE FROM membership_requests WHERE id=?").bind(requestIdNew).run();return stored;}}
    for(const admin of await tradeAdminUsers(env,tradeId))await notify(env,admin.user_id,tradeId,"membership_received","Nouvelle demande d’adhésion",`${auth.name} a transmis une demande.`,`/demandes-adhesion/${requestIdNew}`);
    return reply({id:requestIdNew,status:"pending"},201);
  }
  if (request.method === "PATCH" && requestId && action === "decision") {
    const input=await body(request); if(!input)return fail("Données invalides.",400);
    const decision=cleanText(input.decision,30); if(!["accepted","rejected","needs_information"].includes(decision))return fail("Décision invalide.",400);
    const row=await env.DB.prepare("SELECT * FROM membership_requests WHERE id=?").bind(requestId).first<Record<string,unknown>>(); if(!row)return fail("Demande introuvable.",404);
    if(!(await requireTradeRole(env,auth,String(row.trade_id),["admin_metier"])))return fail("Accès refusé.",403,"forbidden");
    if(String(row.user_id)===auth.id)return fail("Vous ne pouvez pas valider votre propre adhésion.",403,"self_approval_forbidden");
    if(!["pending","needs_information"].includes(String(row.status)))return fail("Cette demande a déjà été traitée.",409,"invalid_transition");
    const reason=cleanText(input.reason,1000);
    const statements=[env.DB.prepare("UPDATE membership_requests SET status=?,decision_reason=?,decided_by=?,decided_at=?,updated_at=? WHERE id=? AND status IN ('pending','needs_information')").bind(decision,reason||null,auth.id,now(),now(),requestId)];
    if(decision==="accepted")statements.push(env.DB.prepare("INSERT INTO trade_memberships (id,trade_id,user_id,role,status,project_class,credits) VALUES (?,?,?,?, 'active',?,0)").bind(id("mem"),row.trade_id,row.user_id,row.requested_role,row.requested_role==="freelance"?"D":null));
    statements.push(env.DB.prepare("INSERT INTO notifications (id,trade_id,user_id,kind,title,message,target_path) VALUES (?,?,?,?,?,?,?)").bind(id("not"),row.trade_id,row.user_id,`membership_${decision}`,decision==="accepted"?"Adhésion acceptée":decision==="rejected"?"Adhésion refusée":"Complément demandé",reason||"Votre demande d’adhésion a été mise à jour.","/"));
    await env.DB.batch(statements); await audit(env,auth,`membership.${decision}`,"membership_request",requestId,String(row.trade_id));
    return reply({id:requestId,status:decision});
  }
  return fail("Méthode non autorisée.",405);
}

async function storeWorkflowFile(env: V1Env, auth: Auth, file: File, link: {tradeId:string;area:string;visibility:string;quoteRequestId?:string;quoteId?:string;membershipRequestId?:string}) {
  if(file.size===0||file.size>maxUploadBytes)return fail("Le fichier doit être compris entre 1 octet et 20 Mo.",413,"file_size");const original=file.name.replace(/[\\/\0]/g,"_").slice(0,180);const ext=(original.split(".").pop()||"").toLowerCase();if(!allowedExtensions.has(ext))return fail("Ce format de fichier n’est pas autorisé.",415,"file_type");const document=id("doc"),key=`trades/${link.tradeId}/workflow/${link.area}/${document}`;await env.BUCKET.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||"application/octet-stream"},customMetadata:{originalName:original,documentId:document}});try{await env.DB.prepare("INSERT INTO documents (id,trade_id,quote_request_id,quote_id,membership_request_id,area,owner_user_id,original_name,storage_key,mime_type,size_bytes,visibility) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(document,link.tradeId,link.quoteRequestId||null,link.quoteId||null,link.membershipRequestId||null,link.area,auth.id,original,key,file.type||"application/octet-stream",file.size,link.visibility).run();}catch{await env.BUCKET.delete(key);return fail("Impossible d’enregistrer le document.",500);}return {id:document,originalName:original};
}

async function handleMemberUpdate(request: Request, env: V1Env, auth: Auth, membershipId: string) {
  if(request.method!=="PATCH")return fail("Méthode non autorisée.",405);
  const row=await env.DB.prepare("SELECT * FROM trade_memberships WHERE id=?").bind(membershipId).first<Record<string,unknown>>(); if(!row)return fail("Membre introuvable.",404);
  if(!(await requireTradeRole(env,auth,String(row.trade_id),["admin_metier"])))return fail("Accès refusé.",403,"forbidden");
  const input=await body(request); if(!input)return fail("Données invalides.",400);
  const projectClass=input.projectClass===undefined?String(row.project_class||"D"):String(input.projectClass); const credits=input.credits===undefined?Number(row.credits):int(input.credits,0,100); const rating=input.rating===undefined?Number(row.rating):Number(input.rating); const status=input.status===undefined?String(row.status):String(input.status);
  if(!isClass(projectClass)||credits===null||!Number.isFinite(rating)||rating<0||rating>5||!["active","suspended"].includes(status))return fail("Classe, crédits, note ou statut invalide.",400);
  const statements=[env.DB.prepare("UPDATE trade_memberships SET project_class=?,credits=?,rating=?,status=?,updated_at=? WHERE id=?").bind(projectClass,credits,rating,status,now(),membershipId)];
  if(credits!==Number(row.credits))statements.push(env.DB.prepare("INSERT INTO credit_movements (id,trade_id,membership_id,value_before,delta,value_after,reason,actor_user_id) VALUES (?,?,?,?,?,?,?,?)").bind(id("crm"),row.trade_id,membershipId,row.credits,credits-Number(row.credits),credits,"Ajustement administratif",auth.id));
  await env.DB.batch(statements); await audit(env,auth,"member.updated","trade_membership",membershipId,String(row.trade_id),{projectClass,credits,rating,status});
  return reply({id:membershipId,projectClass,credits,rating,status});
}

async function handleQuoteRequests(request: Request, env: V1Env, auth: Auth) {
  if(request.method!=="POST")return fail("Méthode non autorisée.",405);
  const multipart=request.headers.get("content-type")?.includes("multipart/form-data");const form=multipart?await request.formData():null;const input=multipart?null:await body(request); if(!form&&!input)return fail("Données invalides.",400);
  const tradeId=cleanText(form?.get("tradeId")??input?.tradeId,80); const personalNumber=cleanText(form?.get("personalNumber")??input?.personalNumber,80); const projectName=cleanText(form?.get("projectName")??input?.projectName,160);const file=form?.get("file");
  const member=await membership(env,auth.id,tradeId,["mandataire"]); if(!member)return fail("Accès mandataire requis pour ce métier.",403,"forbidden");
  if(!personalNumber||!projectName)return fail("Le numéro et le nom du projet sont obligatoires.",400);
  if(!(file instanceof File))return fail("Le document de demande de devis est obligatoire.",400,"document_required");
  const requestId=id("qreq"); try{await env.DB.prepare("INSERT INTO quote_requests (id,trade_id,mandataire_membership_id,personal_number,project_name) VALUES (?,?,?,?,?)").bind(requestId,tradeId,member.id,personalNumber,projectName).run();}catch{return fail("Ce numéro de demande existe déjà.",409,"duplicate_request");}
  if(file instanceof File){const stored=await storeWorkflowFile(env,auth,file,{tradeId,area:"devis",visibility:"quote_parties",quoteRequestId:requestId});if(stored instanceof Response){await env.DB.prepare("DELETE FROM quote_requests WHERE id=?").bind(requestId).run();return stored;}}
  for(const admin of await tradeAdminUsers(env,tradeId))await notify(env,admin.user_id,tradeId,"quote_request_received","Nouvelle demande de devis",projectName,`/demandes-de-devis/${requestId}`);
  return reply({id:requestId,status:"submitted"},201);
}

async function handleQuotes(request: Request, env: V1Env, auth: Auth, quoteId?: string, action?: string) {
  if(request.method==="POST"&&!quoteId){
    const multipart=request.headers.get("content-type")?.includes("multipart/form-data");const form=multipart?await request.formData():null;const input=multipart?null:await body(request);if(!form&&!input)return fail("Données invalides.",400);const value=(key:string)=>form?.get(key)??input?.[key];const requestId=cleanText(value("requestId"),100);const file=form?.get("file");
    const source=await env.DB.prepare("SELECT * FROM quote_requests WHERE id=?").bind(requestId).first<Record<string,unknown>>();if(!source)return fail("Demande introuvable.",404);
    if(!(await requireTradeRole(env,auth,String(source.trade_id),["admin_metier"])))return fail("Accès refusé.",403,"forbidden");
    const projectClass=String(value("projectClass"));const requiredCredits=int(value("requiredCredits"),0,100);const amount=cents(value("amountCents"));const eurekaNumber=cleanText(value("eurekaNumber"),80);const projectName=cleanText(value("projectName"),160);
    if(!isClass(projectClass)||requiredCredits===null||amount===null||!eurekaNumber||!projectName)return fail("Informations du devis incomplètes.",400);
    const current=await env.DB.prepare("SELECT COALESCE(MAX(version),0) version FROM quotes WHERE quote_request_id=?").bind(requestId).first<{version:number}>();const quote=id("quo");
    try{await env.DB.batch([env.DB.prepare("INSERT INTO quotes (id,trade_id,quote_request_id,version,eureka_number,project_name,project_class,required_credits,amount_cents,status,created_by,sent_at) VALUES (?,?,?,?,?,?,?,?,?,'sent',?,?)").bind(quote,source.trade_id,requestId,Number(current?.version||0)+1,eurekaNumber,projectName,projectClass,requiredCredits,amount,auth.id,now()),env.DB.prepare("UPDATE quote_requests SET status='quoted',updated_at=? WHERE id=?").bind(now(),requestId)]);}catch{return fail("Le numéro de devis est déjà utilisé.",409,"duplicate_quote");}
    if(file instanceof File){const stored=await storeWorkflowFile(env,auth,file,{tradeId:String(source.trade_id),area:"devis",visibility:"quote_parties",quoteId:quote});if(stored instanceof Response)return stored;}
    const target=await env.DB.prepare("SELECT user_id FROM trade_memberships WHERE id=?").bind(source.mandataire_membership_id).first<{user_id:string}>();if(target)await notify(env,target.user_id,String(source.trade_id),"quote_received","Nouveau devis",projectName,`/devis/${quote}`);
    await audit(env,auth,"quote.sent","quote",quote,String(source.trade_id));return reply({id:quote,status:"sent"},201);
  }
  if(request.method==="PATCH"&&quoteId&&action){
    const quote=await env.DB.prepare("SELECT q.*,qr.mandataire_membership_id FROM quotes q JOIN quote_requests qr ON qr.id=q.quote_request_id WHERE q.id=?").bind(quoteId).first<Record<string,unknown>>();if(!quote)return fail("Devis introuvable.",404);
    const member=await membership(env,auth.id,String(quote.trade_id),["mandataire"]);if(!member||member.id!==quote.mandataire_membership_id)return fail("Accès refusé.",403,"forbidden");
    if(String(quote.status)!=="sent")return fail("Cette décision n’est plus possible.",409,"invalid_transition");
    if(action==="revision"||action==="refuse"){const status=action==="revision"?"revision_requested":"refused";const input=await body(request);const message=cleanText(input?.message,1200);await env.DB.prepare("UPDATE quotes SET status=?,revision_message=?,decided_at=?,updated_at=? WHERE id=? AND status='sent'").bind(status,message||null,now(),now(),quoteId).run();await notify(env,String(quote.created_by),String(quote.trade_id),action==="revision"?"quote_revision":"quote_refused",action==="revision"?"Modification de devis demandée":"Devis refusé",String(quote.project_name),`/demandes-de-devis/${quote.quote_request_id}`);return reply({id:quoteId,status});}
    if(action!=="accept")return fail("Action inconnue.",404);
    const missionId=id("mis");
    await env.DB.batch([env.DB.prepare("UPDATE quotes SET status='accepted',decided_at=?,updated_at=? WHERE id=? AND status='sent'").bind(now(),now(),quoteId),env.DB.prepare("INSERT INTO missions (id,trade_id,quote_id,mandataire_membership_id,title,required_class,required_credits,amount_cents,status,published_at) VALUES (?,?,?,?,?,?,?,?,'published',?)").bind(missionId,quote.trade_id,quoteId,quote.mandataire_membership_id,quote.project_name,quote.project_class,quote.required_credits,quote.amount_cents,now())]);
    const freelancers=(await env.DB.prepare("SELECT user_id FROM trade_memberships WHERE trade_id=? AND role='freelance' AND status='active'").bind(quote.trade_id).all<{user_id:string}>()).results;for(const freelancer of freelancers)await notify(env,freelancer.user_id,String(quote.trade_id),"mission_published","Nouvelle mission",String(quote.project_name),`/missions/${missionId}`);
    return reply({id:quoteId,status:"accepted",missionId});
  }
  return fail("Méthode non autorisée.",405);
}

async function handleApplication(request: Request, env: V1Env, auth: Auth, missionId: string) {
  if(request.method!=="POST")return fail("Méthode non autorisée.",405);
  const mission=await env.DB.prepare("SELECT * FROM missions WHERE id=?").bind(missionId).first<Record<string,unknown>>();if(!mission)return fail("Mission introuvable.",404);
  const member=await membership(env,auth.id,String(mission.trade_id),["freelance"]);if(!member)return fail("Mission inaccessible.",403,"forbidden");
  if(mission.status!=="published")return fail("Cette mission n’accepte plus de candidatures.",409,"mission_closed");
  if(!isMissionEligible(String(member.project_class||"D"),member.credits-member.reserved_credits,String(mission.required_class),Number(mission.required_credits)))return fail("Votre classe ou vos crédits sont insuffisants.",403,"eligibility_failed");
  const count=await env.DB.prepare("SELECT COUNT(*) count FROM applications WHERE mission_id=? AND status='submitted'").bind(missionId).first<{count:number}>();if(Number(count?.count||0)>=Number(mission.applications_limit))return fail("La limite de candidatures est atteinte.",409,"application_limit");
  const applicationId=id("app");try{await env.DB.prepare("INSERT INTO applications (id,trade_id,mission_id,freelancer_membership_id) VALUES (?,?,?,?)").bind(applicationId,mission.trade_id,missionId,member.id).run();}catch{return fail("Vous avez déjà postulé.",409,"duplicate_application");}
  const owner=await env.DB.prepare("SELECT user_id FROM trade_memberships WHERE id=?").bind(mission.mandataire_membership_id).first<{user_id:string}>();if(owner)await notify(env,owner.user_id,String(mission.trade_id),"application_received","Nouvelle postulation",auth.name,`/postulations/${missionId}`);
  return reply({id:applicationId,status:"submitted"},201);
}

async function handleAssignment(request: Request, env: V1Env, auth: Auth, missionId: string) {
  if(request.method!=="POST")return fail("Méthode non autorisée.",405);const input=await body(request);const applicationId=cleanText(input?.applicationId,100);
  const mission=await env.DB.prepare("SELECT * FROM missions WHERE id=?").bind(missionId).first<Record<string,unknown>>();if(!mission)return fail("Mission introuvable.",404);
  const mandataire=await membership(env,auth.id,String(mission.trade_id),["mandataire"]);if(!mandataire||mandataire.id!==mission.mandataire_membership_id)return fail("Accès refusé.",403,"forbidden");
  const application=await env.DB.prepare("SELECT * FROM applications WHERE id=? AND mission_id=? AND status='submitted'").bind(applicationId,missionId).first<Record<string,unknown>>();if(!application)return fail("Candidature introuvable.",404);
  const freelancer=await env.DB.prepare("SELECT * FROM trade_memberships WHERE id=? AND trade_id=? AND role='freelance' AND status='active'").bind(application.freelancer_membership_id,mission.trade_id).first<Record<string,unknown>>();if(!freelancer)return fail("Freelance indisponible.",409);
  if(Number(freelancer.credits)-Number(freelancer.reserved_credits)<Number(mission.required_credits))return fail("Les crédits disponibles sont insuffisants.",409,"credits_changed");
  const projectId=id("prj"), assignmentId=id("asn"), eventId=id("evt");
  const batch=await env.DB.batch([env.DB.prepare("UPDATE missions SET status='assigned',updated_at=? WHERE id=? AND status='published'").bind(now(),missionId),env.DB.prepare("INSERT INTO projects (id,trade_id,mission_id,mandataire_membership_id,freelancer_membership_id,title,project_class,reserved_credits,amount_cents) SELECT ?,trade_id,id,mandataire_membership_id,?,?,required_class,required_credits,amount_cents FROM missions WHERE id=? AND status='assigned'").bind(projectId,application.freelancer_membership_id,mission.title,missionId),env.DB.prepare("INSERT INTO assignments (id,trade_id,mission_id,project_id,application_id,freelancer_membership_id,assigned_by_membership_id) VALUES (?,?,?,?,?,?,?)").bind(assignmentId,mission.trade_id,missionId,projectId,applicationId,application.freelancer_membership_id,mandataire.id),env.DB.prepare("UPDATE applications SET status=CASE WHEN id=? THEN 'selected' ELSE 'rejected' END,updated_at=? WHERE mission_id=? AND status='submitted'").bind(applicationId,now(),missionId),env.DB.prepare("UPDATE trade_memberships SET reserved_credits=reserved_credits+?,updated_at=? WHERE id=? AND credits-reserved_credits>=?").bind(mission.required_credits,now(),application.freelancer_membership_id,mission.required_credits),env.DB.prepare("INSERT INTO project_events (id,trade_id,project_id,actor_user_id,event_type,summary) VALUES (?,?,?,?,?,?)").bind(eventId,mission.trade_id,projectId,auth.id,"project.started","Projet démarré")]);
  if(!batch[0].meta.changes||!batch[1].meta.changes||!batch[4].meta.changes)return fail("La mission a déjà été attribuée ou les crédits ont changé.",409,"concurrent_assignment");
  const candidates=(await env.DB.prepare("SELECT tm.user_id,a.status FROM applications a JOIN trade_memberships tm ON tm.id=a.freelancer_membership_id WHERE a.mission_id=?").bind(missionId).all<{user_id:string,status:string}>()).results;for(const candidate of candidates)await notify(env,candidate.user_id,String(mission.trade_id),candidate.status==="selected"?"freelancer_selected":"application_rejected",candidate.status==="selected"?"Vous avez été sélectionné":"Mission attribuée",String(mission.title),candidate.status==="selected"?`/projets/${projectId}`:"/tableau-de-missions");
  await audit(env,auth,"mission.assigned","mission",missionId,String(mission.trade_id),{projectId,applicationId});return reply({projectId,status:"in_progress"},201);
}

async function projectAccess(env: V1Env, auth: Auth, projectId: string) {
  const project=await env.DB.prepare("SELECT * FROM projects WHERE id=?").bind(projectId).first<Record<string,unknown>>();if(!project)return null;
  if(auth.globalAdmin)return project;const member=await membership(env,auth.id,String(project.trade_id));if(!member)return null;
  if(member.role==="admin_metier")return project;
  if(member.role==="freelance"&&member.id===project.freelancer_membership_id)return project;
  if(member.role==="mandataire"&&member.id===project.mandataire_membership_id)return project;
  return null;
}

async function handleProjectAction(request: Request, env: V1Env, auth: Auth, projectId: string, action: string) {
  const project=await projectAccess(env,auth,projectId);if(!project)return fail("Projet introuvable ou inaccessible.",404);
  const member=auth.globalAdmin?null:await membership(env,auth.id,String(project.trade_id));const input=await body(request);const comment=cleanText(input?.comment,1500);
  if(action==="request-validation"){
    if(request.method!=="POST"||member?.role!=="freelance"||project.status!=="in_progress")return fail("Transition non autorisée.",409,"invalid_transition");
    await env.DB.batch([env.DB.prepare("UPDATE projects SET status='validation_requested',updated_at=? WHERE id=? AND status='in_progress'").bind(now(),projectId),env.DB.prepare("INSERT INTO validations (id,trade_id,project_id,requested_by,status,comment) VALUES (?,?,?,?, 'requested',?)").bind(id("val"),project.trade_id,projectId,auth.id,comment||null),env.DB.prepare("INSERT INTO project_events (id,trade_id,project_id,actor_user_id,event_type,summary) VALUES (?,?,?,?,?,?)").bind(id("evt"),project.trade_id,projectId,auth.id,"validation.requested","Validation demandée")]);return reply({status:"validation_requested"});
  }
  if(action==="correction"){
    if(request.method!=="POST"||member?.role!=="mandataire"||project.status!=="validation_requested")return fail("Transition non autorisée.",409,"invalid_transition");
    await env.DB.batch([env.DB.prepare("UPDATE projects SET status='correction_requested',updated_at=? WHERE id=?").bind(now(),projectId),env.DB.prepare("UPDATE validations SET status='correction_requested',decided_by=?,decided_at=?,comment=? WHERE project_id=? AND status='requested'").bind(auth.id,now(),comment||null,projectId),env.DB.prepare("INSERT INTO project_events (id,trade_id,project_id,actor_user_id,event_type,summary) VALUES (?,?,?,?,?,?)").bind(id("evt"),project.trade_id,projectId,auth.id,"correction.requested","Correction demandée")]);return reply({status:"correction_requested"});
  }
  if(action==="resubmit"){
    if(request.method!=="POST"||member?.role!=="freelance"||project.status!=="correction_requested")return fail("Transition non autorisée.",409,"invalid_transition");
    await env.DB.batch([env.DB.prepare("UPDATE projects SET status='validation_requested',updated_at=? WHERE id=?").bind(now(),projectId),env.DB.prepare("INSERT INTO validations (id,trade_id,project_id,requested_by,status,comment) VALUES (?,?,?,?, 'requested',?)").bind(id("val"),project.trade_id,projectId,auth.id,comment||null)]);return reply({status:"validation_requested"});
  }
  if(action==="close"){
    if(request.method!=="POST"||member?.role!=="mandataire"||project.status!=="validation_requested")return fail("Transition non autorisée.",409,"invalid_transition");
    const score=int(input?.score,1,5);if(score===null)return fail("Une note de 1 à 5 est obligatoire.",400);
    const freelancer=await env.DB.prepare("SELECT tm.*,u.id user_id FROM trade_memberships tm JOIN users u ON u.id=tm.user_id WHERE tm.id=?").bind(project.freelancer_membership_id).first<Record<string,unknown>>();if(!freelancer)return fail("Freelance introuvable.",409);
    const oldCredits=Number(freelancer.credits),reserved=Number(project.reserved_credits),bonus=Math.max(0,score-3),newCredits=Math.min(100,oldCredits+bonus);
    await env.DB.batch([env.DB.prepare("UPDATE projects SET status='closed',closed_at=?,updated_at=? WHERE id=? AND status='validation_requested'").bind(now(),now(),projectId),env.DB.prepare("UPDATE validations SET status='accepted',decided_by=?,decided_at=? WHERE project_id=? AND status='requested'").bind(auth.id,now(),projectId),env.DB.prepare("UPDATE trade_memberships SET reserved_credits=MAX(0,reserved_credits-?),credits=?,updated_at=? WHERE id=?").bind(reserved,newCredits,now(),project.freelancer_membership_id),env.DB.prepare("INSERT INTO credit_movements (id,trade_id,membership_id,project_id,value_before,delta,value_after,reason,actor_user_id,automatic) VALUES (?,?,?,?,?,?,?,?,?,1)").bind(id("crm"),project.trade_id,project.freelancer_membership_id,projectId,oldCredits,bonus,newCredits,"Clôture du projet et bonus validé",auth.id),env.DB.prepare("INSERT INTO ratings (id,trade_id,project_id,rater_user_id,rated_user_id,score,comment) VALUES (?,?,?,?,?,?,?)").bind(id("rat"),project.trade_id,projectId,auth.id,freelancer.user_id,score,comment||null),env.DB.prepare("INSERT INTO invoices (id,trade_id,project_id,reference,amount_cents,status) VALUES (?,?,?,?,?,'to_invoice')").bind(id("inv"),project.trade_id,projectId,`FAC-${projectId.slice(-8).toUpperCase()}`,project.amount_cents),env.DB.prepare("INSERT INTO project_events (id,trade_id,project_id,actor_user_id,event_type,summary) VALUES (?,?,?,?,?,?)").bind(id("evt"),project.trade_id,projectId,auth.id,"project.closed","Projet clôturé")]);return reply({status:"closed",credits:newCredits,bonus});
  }
  return fail("Action inconnue.",404);
}

async function handleMilestones(request:Request,env:V1Env,auth:Auth,projectId?:string,milestoneId?:string){
  if(request.method==="POST"&&projectId){const project=await projectAccess(env,auth,projectId);if(!project)return fail("Projet introuvable ou inaccessible.",404);const member=auth.globalAdmin?null:await membership(env,auth.id,String(project.trade_id));if(!auth.globalAdmin&&member?.role!=="mandataire"&&member?.role!=="admin_metier")return fail("Accès refusé.",403);const input=await body(request);const title=cleanText(input?.title,160),dueAt=cleanText(input?.dueAt,40);if(!title)return fail("Le titre du jalon est obligatoire.",400);const count=await env.DB.prepare("SELECT COUNT(*) count FROM milestones WHERE project_id=?").bind(projectId).first<{count:number}>();const milestone=id("mil");await env.DB.batch([env.DB.prepare("INSERT INTO milestones (id,trade_id,project_id,title,due_at,position) VALUES (?,?,?,?,?,?)").bind(milestone,project.trade_id,projectId,title,dueAt||null,Number(count?.count||0)),env.DB.prepare("INSERT INTO project_events (id,trade_id,project_id,actor_user_id,event_type,summary) VALUES (?,?,?,?,?,?)").bind(id("evt"),project.trade_id,projectId,auth.id,"milestone.created",`Jalon créé : ${title}`)]);return reply({id:milestone,status:"planned"},201);}
  if(request.method==="PATCH"&&milestoneId){const row=await env.DB.prepare("SELECT m.*,p.freelancer_membership_id,p.mandataire_membership_id FROM milestones m JOIN projects p ON p.id=m.project_id WHERE m.id=?").bind(milestoneId).first<Record<string,unknown>>();if(!row||!(await projectAccess(env,auth,String(row.project_id))))return fail("Jalon introuvable ou inaccessible.",404);const member=auth.globalAdmin?null:await membership(env,auth.id,String(row.trade_id));const input=await body(request);const status=cleanText(input?.status,40);const allowed:Record<string,string[]>={planned:["in_progress","cancelled"],in_progress:["submitted","cancelled"],submitted:["validated","in_progress"],validated:[],late:["submitted","cancelled"],cancelled:[]};if(!allowed[String(row.status)]?.includes(status))return fail("Transition de jalon invalide.",409);const roleAllowed=auth.globalAdmin||member?.role==="admin_metier"||(member?.role==="freelance"&&["in_progress","submitted"].includes(status))||(member?.role==="mandataire"&&["validated","in_progress","cancelled"].includes(status));if(!roleAllowed)return fail("Accès refusé.",403);await env.DB.batch([env.DB.prepare("UPDATE milestones SET status=?,updated_at=? WHERE id=?").bind(status,now(),milestoneId),env.DB.prepare("INSERT INTO project_events (id,trade_id,project_id,actor_user_id,event_type,summary) VALUES (?,?,?,?,?,?)").bind(id("evt"),row.trade_id,row.project_id,auth.id,"milestone.updated",`Jalon : ${status}`)]);return reply({id:milestoneId,status});}
  return fail("Méthode non autorisée.",405);
}

async function documentAllowed(env: V1Env, auth: Auth, doc: Record<string,unknown>) {
  if(auth.globalAdmin)return true;const member=await membership(env,auth.id,String(doc.trade_id));if(!member)return false;
  if(member.role==="admin_metier")return true;
  if(doc.visibility==="trade_freelance")return member.role==="freelance";
  if(doc.visibility==="trade_mandataire")return member.role==="mandataire";
  if(doc.project_id)return Boolean(await projectAccess(env,auth,String(doc.project_id)));
  if(doc.membership_request_id){const req=await env.DB.prepare("SELECT user_id FROM membership_requests WHERE id=?").bind(doc.membership_request_id).first<{user_id:string}>();return req?.user_id===auth.id;}
  if(doc.visibility==="quote_parties"){const q=doc.quote_request_id?await env.DB.prepare("SELECT tm.user_id FROM quote_requests qr JOIN trade_memberships tm ON tm.id=qr.mandataire_membership_id WHERE qr.id=?").bind(doc.quote_request_id).first<{user_id:string}>():await env.DB.prepare("SELECT tm.user_id FROM quotes q JOIN quote_requests qr ON qr.id=q.quote_request_id JOIN trade_memberships tm ON tm.id=qr.mandataire_membership_id WHERE q.id=?").bind(doc.quote_id).first<{user_id:string}>();return q?.user_id===auth.id;}
  return false;
}

async function handleDocuments(request: Request, env: V1Env, auth: Auth, documentId?: string, action?: string) {
  if(request.method==="GET"&&documentId&&action==="download"){
    const doc=await env.DB.prepare("SELECT * FROM documents WHERE id=? AND status='active'").bind(documentId).first<Record<string,unknown>>();if(!doc||!(await documentAllowed(env,auth,doc)))return fail("Document introuvable ou inaccessible.",404);
    const object=await env.BUCKET.get(String(doc.storage_key));if(!object)return fail("Document introuvable.",404,"missing_object");const headers=new Headers();headers.set("content-type",String(doc.mime_type));headers.set("content-length",String(doc.size_bytes));headers.set("content-disposition",`attachment; filename*=UTF-8''${encodeURIComponent(String(doc.original_name))}`);headers.set("cache-control","private, no-store");headers.set("x-content-type-options","nosniff");return new Response(object.body,{headers});
  }
  if(request.method==="DELETE"&&documentId){
    const doc=await env.DB.prepare("SELECT * FROM documents WHERE id=? AND status='active'").bind(documentId).first<Record<string,unknown>>();if(!doc)return fail("Document introuvable.",404);const member=await requireTradeRole(env,auth,String(doc.trade_id),["admin_metier"]);if(!member&&doc.owner_user_id!==auth.id)return fail("Accès refusé.",403);await env.DB.prepare("UPDATE documents SET status='archived',archived_at=?,updated_at=? WHERE id=?").bind(now(),now(),documentId).run();await audit(env,auth,"document.archived","document",documentId,String(doc.trade_id));return reply({id:documentId,status:"archived"});
  }
  if(request.method==="GET"){
    const url=new URL(request.url);const tradeId=cleanText(url.searchParams.get("tradeId"),80);const projectId=cleanText(url.searchParams.get("projectId"),100);const area=cleanText(url.searchParams.get("area"),40);if(!tradeId)return fail("Métier obligatoire.",400);
    if(!(await membership(env,auth.id,tradeId))&&!auth.globalAdmin)return fail("Accès refusé.",403);let sql="SELECT id,trade_id,project_id,area,original_name,mime_type,size_bytes,visibility,created_at FROM documents WHERE trade_id=? AND status='active'";const bindings:unknown[]=[tradeId];if(projectId){sql+=" AND project_id=?";bindings.push(projectId);}if(area){sql+=" AND area=?";bindings.push(area);}sql+=" ORDER BY created_at DESC";const rows=(await env.DB.prepare(sql).bind(...bindings).all<Record<string,unknown>>()).results;const visible=[];for(const row of rows)if(await documentAllowed(env,auth,row))visible.push({...row,downloadUrl:`/api/v1/documents/${row.id}/download`});return reply({documents:visible});
  }
  if(request.method!=="POST")return fail("Méthode non autorisée.",405);
  const form=await request.formData();const file=form.get("file");const tradeId=cleanText(form.get("tradeId"),80);const projectId=cleanText(form.get("projectId"),100);const area=cleanText(form.get("area"),40);const visibility=cleanText(form.get("visibility"),40)||"project";
  const shareFolderId=cleanText(form.get("shareFolderId"),100);
  if(!(file instanceof File)||!tradeId)return fail("Fichier et métier obligatoires.",400);if(file.size===0||file.size>maxUploadBytes)return fail("Le fichier doit être compris entre 1 octet et 20 Mo.",413,"file_size");const original=file.name.replace(/[\\/\0]/g,"_").slice(0,180);const ext=(original.split(".").pop()||"").toLowerCase();if(!allowedExtensions.has(ext))return fail("Ce format de fichier n’est pas autorisé.",415,"file_type");
  let allowed=false;if(projectId){const project=await projectAccess(env,auth,projectId);const member=await membership(env,auth.id,tradeId);allowed=Boolean(project&&project.trade_id===tradeId&&allowedProjectAreas.has(area)&&canUploadProjectArea(auth.globalAdmin?"admin_eureka":member?.role||"",area));}else{const admin=await requireTradeRole(env,auth,tradeId,["admin_metier"]);allowed=Boolean(admin&&["partage_freelance","partage_mandataire","adhesion"].includes(area));if(allowed&&shareFolderId){const folder=await env.DB.prepare("SELECT id,audience FROM share_folders WHERE id=? AND trade_id=? AND status='active'").bind(shareFolderId,tradeId).first<Record<string,unknown>>();allowed=Boolean(folder&&area===`partage_${folder.audience}`);}}if(!allowed)return fail("Dépôt non autorisé.",403,"forbidden");
  const document=id("doc"),key=`trades/${tradeId}/${projectId?`projects/${projectId}`:"shared"}/${area}/${document}`;await env.BUCKET.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||"application/octet-stream"},customMetadata:{originalName:original,documentId:document}});try{await env.DB.prepare("INSERT INTO documents (id,trade_id,project_id,share_folder_id,area,owner_user_id,original_name,storage_key,mime_type,size_bytes,visibility) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(document,tradeId,projectId||null,shareFolderId||null,area,auth.id,original,key,file.type||"application/octet-stream",file.size,projectId?"project":visibility).run();}catch{await env.BUCKET.delete(key);return fail("Impossible d’enregistrer le document.",500);}
  if(projectId){
    await env.DB.prepare("INSERT INTO project_events (id,trade_id,project_id,actor_user_id,event_type,summary,metadata_json) VALUES (?,?,?,?,?,?,?)").bind(id("evt"),tradeId,projectId,auth.id,"document.added",`Document ajouté : ${original}`,JSON.stringify({documentId:document,area})).run();
    const parties=(await env.DB.prepare("SELECT tm.user_id FROM projects p JOIN trade_memberships tm ON tm.id IN (p.mandataire_membership_id,p.freelancer_membership_id) WHERE p.id=? AND tm.user_id!=?").bind(projectId,auth.id).all<{user_id:string}>()).results;
    for(const party of parties)await notify(env,party.user_id,tradeId,"document_added","Nouveau document",original,`/projets/${projectId}`);
  }
  return reply({id:document,originalName:original,downloadUrl:`/api/v1/documents/${document}/download`},201);
}

async function handleNotifications(request: Request, env: V1Env, auth: Auth, notificationId?: string) {
  if(request.method==="GET")return reply({notifications:(await env.DB.prepare("SELECT id,kind,title,message,target_path,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(auth.id).all()).results});
  if(request.method==="PATCH"&&notificationId){const result=await env.DB.prepare("UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?").bind(now(),notificationId,auth.id).run();if(!result.meta.changes)return fail("Notification introuvable.",404);return reply({id:notificationId,read:true});}return fail("Méthode non autorisée.",405);
}

async function handleInvoices(request: Request, env: V1Env, auth: Auth, invoiceId: string) {
  if(request.method!=="PATCH")return fail("Méthode non autorisée.",405);const invoice=await env.DB.prepare("SELECT * FROM invoices WHERE id=?").bind(invoiceId).first<Record<string,unknown>>();if(!invoice)return fail("Facture introuvable.",404);if(!(await requireTradeRole(env,auth,String(invoice.trade_id),["admin_metier"])))return fail("Accès refusé.",403);const input=await body(request);const status=cleanText(input?.status,40);if(!invoiceTransitionAllowed(String(invoice.status),status))return fail("Transition de facturation invalide.",409,"invalid_transition");await env.DB.batch([env.DB.prepare("UPDATE invoices SET status=?,issue_date=COALESCE(issue_date,CASE WHEN ?='invoice_sent' THEN ? END),confirmed_by=?,updated_at=? WHERE id=?").bind(status,status,now().slice(0,10),auth.id,now(),invoiceId),env.DB.prepare("INSERT INTO invoice_events (id,invoice_id,actor_user_id,old_status,new_status,note) VALUES (?,?,?,?,?,?)").bind(id("ine"),invoiceId,auth.id,invoice.status,status,cleanText(input?.note,1000)||null)]);await audit(env,auth,"invoice.status_changed","invoice",invoiceId,String(invoice.trade_id),{from:invoice.status,to:status});return reply({id:invoiceId,status});
}

async function handleAccountRequest(request: Request, env: V1Env, auth: Auth) { if(request.method!=="POST")return fail("Méthode non autorisée.",405);const input=await body(request);const kind=cleanText(input?.kind,40);if(!["data_export","account_deactivation","account_deletion"].includes(kind))return fail("Type de demande invalide.",400);const open=await env.DB.prepare("SELECT id FROM account_requests WHERE user_id=? AND kind=? AND status IN ('pending','processing')").bind(auth.id,kind).first();if(open)return fail("Une demande identique est déjà en cours.",409);const requestId=id("accreq");await env.DB.prepare("INSERT INTO account_requests (id,user_id,kind) VALUES (?,?,?)").bind(requestId,auth.id,kind).run();return reply({id:requestId,status:"pending",message:"La demande sera traitée administrativement; les données soumises à une obligation de conservation ne seront pas supprimées immédiatement."},201); }

async function handleProfile(request:Request,env:V1Env,auth:Auth){
  if(request.method!=="PATCH")return fail("Méthode non autorisée.",405);const input=await body(request);const displayName=cleanText(input?.name,120);
  if(!displayName)return fail("Le nom est obligatoire.",400);await env.DB.prepare("UPDATE users SET display_name=?,updated_at=? WHERE id=?").bind(displayName,now(),auth.id).run();
  return reply({ok:true,name:displayName});
}

async function handleAdminAssignment(request:Request,env:V1Env,auth:Auth,userId:string){
  if(request.method!=="POST")return fail("Méthode non autorisée.",405);
  if(!auth.globalAdmin)return fail("Accès réservé à l’Admin Eurêka.",403,"forbidden");
  if(userId===auth.id)return fail("Votre compte est déjà Admin global.",409,"admin_role_exists");
  const input=await body(request);const tradeId=cleanText(input?.tradeId,80);
  if(!tradeId)return fail("Le métier est obligatoire.",400,"validation_error");
  const target=await env.DB.prepare("SELECT id,display_name,eureka_email FROM users WHERE id=? AND status='active'").bind(userId).first<Record<string,unknown>>();
  if(!target)return fail("Utilisateur introuvable ou inactif.",404,"user_not_found");
  if(!await env.DB.prepare("SELECT id FROM trades WHERE id=? AND status='active'").bind(tradeId).first())return fail("Métier introuvable.",404,"trade_not_found");
  const existing=await env.DB.prepare("SELECT trade_id FROM trade_memberships WHERE user_id=? AND role IN ('admin_metier','specialiste_metier') AND status='active'").bind(userId).first<Record<string,unknown>>();
  if(existing)return fail(String(existing.trade_id)===tradeId?"Ce compte administre déjà ce métier.":"Ce compte est déjà Admin métier d’un autre métier.",409,"admin_role_exists");
  const eurekaEmail=await ensureEurekaEmail(env,userId,String(target.display_name),target.eureka_email);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO trade_memberships (id,trade_id,user_id,role,status,project_class,credits) VALUES (?,?,?,'admin_metier','active',NULL,0)").bind(id("mem"),tradeId,userId),
    env.DB.prepare("UPDATE membership_requests SET status='withdrawn',decision_reason='Compte nommé Admin métier',decided_by=?,decided_at=?,updated_at=? WHERE user_id=? AND status IN ('pending','needs_information')").bind(auth.id,now(),now(),userId),
    env.DB.prepare("INSERT INTO notifications (id,trade_id,user_id,kind,title,message,target_path) VALUES (?,?,?,?,?,?,?)").bind(id("not"),tradeId,userId,"admin_account_assigned","Compte Admin métier","Votre compte est désormais Admin métier.","/")
  ]);
  await audit(env,auth,"admin.assigned","user",userId,tradeId,{eurekaEmail});
  return reply({id:userId,tradeId,role:"admin_metier",eurekaEmail});
}

async function handleMemberAccounts(request:Request,env:V1Env,auth:Auth){
  if(request.method!=="POST")return fail("Méthode non autorisée.",405);
  const admin=(await memberships(env,auth.id)).find(item=>item.role==="admin_metier");
  if(!admin)return fail("Accès réservé à l’Admin métier.",403,"forbidden");
  const input=await body(request);const displayName=cleanText(input?.name,120);const role=cleanText(input?.role,30);const password=typeof input?.password==="string"?input.password:"";
  if(!displayName||!["freelance","mandataire"].includes(role)||!validPassword(password))return fail("Nom, rôle et mot de passe valide sont obligatoires.",400,"validation_error");
  const userId=id("usr"),privateEmail=`activation.${userId}@eureka.test`,eurekaEmail=await generateEurekaEmail(env,displayName),salt=randomToken(18),hash=await passwordHash(password,salt),membershipId=id("mem");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id,auth_subject,email,eureka_email,display_name,email_verified,last_login_at) VALUES (?,?,?,?,?,1,NULL)").bind(userId,`eureka:${userId}`,privateEmail,eurekaEmail,displayName),
    env.DB.prepare("INSERT INTO profiles (user_id) VALUES (?)").bind(userId),
    env.DB.prepare("INSERT INTO account_credentials (user_id,password_hash,password_salt,password_iterations) VALUES (?,?,?,?)").bind(userId,hash,salt,passwordIterations),
    env.DB.prepare("INSERT INTO trade_memberships (id,trade_id,user_id,role,status,project_class,credits) VALUES (?,?,?,?, 'active',?,0)").bind(membershipId,admin.trade_id,userId,role,role==="freelance"?"D":null)
  ]);
  await audit(env,auth,"test_account.created","user",userId,admin.trade_id,{role,eurekaEmail});
  return reply({id:userId,membershipId,tradeId:admin.trade_id,role,eurekaEmail},201);
}

async function handlePasswordChange(request:Request,env:V1Env,auth:Auth){
  if(request.method!=="POST")return fail("Méthode non autorisée.",405);const input=await body(request);const current=typeof input?.currentPassword==="string"?input.currentPassword:"";const next=typeof input?.newPassword==="string"?input.newPassword:"";
  if(!validPassword(next))return fail("Le nouveau mot de passe doit contenir au moins 10 caractères et un chiffre.",400);
  const credential=await env.DB.prepare("SELECT password_hash,password_salt,password_iterations FROM account_credentials WHERE user_id=?").bind(auth.id).first<Record<string,unknown>>();
  if(!credential||await passwordHash(current,String(credential.password_salt),Number(credential.password_iterations))!==credential.password_hash)return fail("Le mot de passe actuel est incorrect.",401);
  const salt=randomToken(18),hash=await passwordHash(next,salt);const token=cookieValue(request,"eureka_session");const tokenHash=token?await digest(token):"";
  await env.DB.batch([env.DB.prepare("UPDATE account_credentials SET password_hash=?,password_salt=?,password_iterations=?,password_updated_at=? WHERE user_id=?").bind(hash,salt,passwordIterations,now(),auth.id),env.DB.prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND token_hash!=? AND revoked_at IS NULL").bind(now(),auth.id,tokenHash)]);
  await logSecurity(env,auth.id,"password.changed","success",request);return reply({ok:true});
}

async function handleUserStatus(request:Request,env:V1Env,auth:Auth,userId:string){
  if(request.method!=="PATCH")return fail("Méthode non autorisée.",405);if(!auth.globalAdmin)return fail("Accès réservé à l’Admin Eurêka.",403);
  if(userId===auth.id)return fail("Vous ne pouvez pas suspendre votre propre compte.",409);
  const input=await body(request);const status=cleanText(input?.status,30);if(!["active","suspended"].includes(status))return fail("Statut invalide.",400);
  const target=await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(userId).first();if(!target)return fail("Utilisateur introuvable.",404);
  await env.DB.batch([env.DB.prepare("UPDATE users SET status=?,disabled_at=CASE WHEN ?='suspended' THEN ? ELSE NULL END,updated_at=? WHERE id=?").bind(status,status,now(),now(),userId),env.DB.prepare("UPDATE auth_sessions SET revoked_at=CASE WHEN ?='suspended' THEN ? ELSE revoked_at END WHERE user_id=? AND revoked_at IS NULL").bind(status,now(),userId)]);
  await audit(env,auth,`user.${status}`,"user",userId,null);return reply({id:userId,status});
}

async function handleUserDelete(request:Request,env:V1Env,auth:Auth,userId:string){
  if(request.method!=="DELETE")return fail("Méthode non autorisée.",405);
  if(!auth.globalAdmin)return fail("Accès réservé à l’Admin Eurêka.",403,"forbidden");
  const target=await env.DB.prepare("SELECT id,email,display_name FROM users WHERE id=?").bind(userId).first<Record<string,unknown>>();
  if(!target)return fail("Utilisateur introuvable.",404,"user_not_found");
  if(userId===auth.id)return fail("Vous ne pouvez pas supprimer votre propre compte administrateur.",409,"self_delete_forbidden");
  const isGlobalAdmin=await env.DB.prepare("SELECT 1 ok FROM global_roles WHERE user_id=? AND role='admin_eureka'").bind(userId).first();
  if(isGlobalAdmin){const admins=await env.DB.prepare("SELECT COUNT(*) count FROM global_roles gr JOIN users u ON u.id=gr.user_id WHERE gr.role='admin_eureka' AND u.status='active'").first<{count:number}>();if(Number(admins?.count||0)<=1)return fail("Suppression impossible : Eurêka doit conserver au moins un Admin global actif.",409,"last_global_admin");}
  const dependencies:{label:string;sql:string}[]=[
    {label:"adhésions métier",sql:"SELECT COUNT(*) count FROM trade_memberships WHERE user_id=?"},
    {label:"devis créés",sql:"SELECT COUNT(*) count FROM quotes WHERE created_by=?"},
    {label:"documents",sql:"SELECT COUNT(*) count FROM documents WHERE owner_user_id=? AND (membership_request_id IS NULL OR membership_request_id NOT IN (SELECT id FROM membership_requests WHERE user_id=?))"},
    {label:"validations",sql:"SELECT COUNT(*) count FROM validations WHERE requested_by=? OR decided_by=?"},
    {label:"évaluations",sql:"SELECT COUNT(*) count FROM ratings WHERE rater_user_id=? OR rated_user_id=?"},
    {label:"mouvements de crédits",sql:"SELECT COUNT(*) count FROM credit_movements WHERE actor_user_id=?"},
    {label:"événements de projet",sql:"SELECT COUNT(*) count FROM project_events WHERE actor_user_id=?"},
    {label:"actions administratives",sql:"SELECT COUNT(*) count FROM admin_audit_log WHERE actor_user_id=?"},
    {label:"séances créées",sql:"SELECT COUNT(*) count FROM followup_sessions WHERE created_by=?"},
    {label:"dossiers partagés",sql:"SELECT COUNT(*) count FROM share_folders WHERE created_by=?"},
    {label:"paramètres métier",sql:"SELECT COUNT(*) count FROM trade_settings WHERE created_by=? OR validated_by=?"},
    {label:"invitations envoyées",sql:"SELECT COUNT(*) count FROM admin_invitations WHERE invited_by=?"},
    {label:"factures confirmées",sql:"SELECT COUNT(*) count FROM invoices WHERE confirmed_by=?"},
    {label:"historique de facturation",sql:"SELECT COUNT(*) count FROM invoice_events WHERE actor_user_id=?"},
    {label:"documents juridiques",sql:"SELECT COUNT(*) count FROM legal_documents WHERE updated_by=?"},
    {label:"demandes de compte traitées",sql:"SELECT COUNT(*) count FROM account_requests WHERE processed_by=?"}
  ];
  const blockers:{label:string;count:number}[]=[];
  for(const dependency of dependencies){const placeholders=(dependency.sql.match(/\?/g)||[]).length;const row=await env.DB.prepare(dependency.sql).bind(...Array(placeholders).fill(userId)).first<{count:number}>();const count=Number(row?.count||0);if(count)blockers.push({label:dependency.label,count});}
  if(blockers.length)return reply({error:`Impossible de supprimer cet utilisateur : ${blockers.map(item=>`${item.count} ${item.label}`).join(", ")}.`,code:"user_has_dependencies",dependencies:blockers},409);
  try{
    const pendingDocumentKeys=(await env.DB.prepare("SELECT storage_key FROM documents WHERE membership_request_id IN (SELECT id FROM membership_requests WHERE user_id=?)").bind(userId).all<{storage_key:string}>()).results;
    for(const document of pendingDocumentKeys)await env.BUCKET.delete(document.storage_key);
    await env.DB.batch([
      env.DB.prepare("UPDATE security_log SET user_id=NULL WHERE user_id=?").bind(userId),
      env.DB.prepare("DELETE FROM notifications WHERE user_id=?").bind(userId),
      env.DB.prepare("DELETE FROM account_requests WHERE user_id=?").bind(userId),
      env.DB.prepare("DELETE FROM password_reset_tokens WHERE user_id=?").bind(userId),
      env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(userId),
      env.DB.prepare("DELETE FROM account_credentials WHERE user_id=?").bind(userId),
      env.DB.prepare("DELETE FROM profiles WHERE user_id=?").bind(userId),
      env.DB.prepare("DELETE FROM global_roles WHERE user_id=?").bind(userId),
      env.DB.prepare("DELETE FROM documents WHERE membership_request_id IN (SELECT id FROM membership_requests WHERE user_id=?)").bind(userId),
      env.DB.prepare("DELETE FROM membership_requests WHERE user_id=?").bind(userId),
      env.DB.prepare("UPDATE admin_invitations SET status='revoked',updated_at=? WHERE email=? COLLATE NOCASE AND status IN ('awaiting_email','pending')").bind(now(),target.email),
      env.DB.prepare("DELETE FROM users WHERE id=?").bind(userId)
    ]);
  }catch{return fail("Impossible de supprimer cet utilisateur car des données importantes doivent être conservées.",409,"user_has_dependencies");}
  await audit(env,auth,"user.deleted","user",userId,null,{email:target.email,name:target.display_name});
  return reply({id:userId,deleted:true,message:"Utilisateur supprimé avec succès."});
}

export async function handleV1Api(request: Request, env: V1Env): Promise<Response> {
  try {
    const url=new URL(request.url);const parts=url.pathname.split("/").filter(Boolean).slice(2);
    if(parts[0]==="legal"&&request.method==="GET")return reply({documents:(await env.DB.prepare("SELECT kind,title,content,status,updated_at FROM legal_documents ORDER BY title").all()).results});
    if(parts[0]==="public"&&parts[1]==="trades"&&request.method==="GET")return reply({trades:(await env.DB.prepare("SELECT id,name FROM trades WHERE status='active' ORDER BY name").all()).results});
    if(parts[0]==="auth"&&parts[1])return handleAuth(request,env,parts[1]);
    const authResult=await authenticate(request,env);if(authResult instanceof Response)return authResult;const auth=authResult;
    if(!sameOrigin(request)&&["POST","PATCH","PUT","DELETE"].includes(request.method))return fail("Origine de la requête refusée.",403,"csrf_rejected");
    if(parts[0]==="session"&&request.method==="GET")return reply(await sessionState(env,auth));
    if(parts[0]==="trades")return handleTrades(request,env,auth);
    if(parts[0]==="admin-invitations")return handleAdminInvitations(request,env,auth,parts[1],parts[2]);
    if(parts[0]==="trade-settings")return handleTradeSettings(request,env,auth,parts[1],parts[2]);
    if(parts[0]==="membership-requests")return handleMembershipRequests(request,env,auth,parts[1],parts[2]);
    if(parts[0]==="share-folders")return handleShareFolders(request,env,auth);
    if(parts[0]==="members"&&parts[1])return handleMemberUpdate(request,env,auth,parts[1]);
    if(parts[0]==="quote-requests")return handleQuoteRequests(request,env,auth);
    if(parts[0]==="quotes")return handleQuotes(request,env,auth,parts[1],parts[2]);
    if(parts[0]==="missions"&&parts[1]&&parts[2]==="applications")return handleApplication(request,env,auth,parts[1]);
    if(parts[0]==="missions"&&parts[1]&&parts[2]==="assign")return handleAssignment(request,env,auth,parts[1]);
    if(parts[0]==="projects"&&parts[1]&&parts[2]==="milestones")return handleMilestones(request,env,auth,parts[1]);
    if(parts[0]==="projects"&&parts[1]&&parts[2])return handleProjectAction(request,env,auth,parts[1],parts[2]);
    if(parts[0]==="milestones"&&parts[1])return handleMilestones(request,env,auth,undefined,parts[1]);
    if(parts[0]==="documents")return handleDocuments(request,env,auth,parts[1],parts[2]);
    if(parts[0]==="notifications")return handleNotifications(request,env,auth,parts[1]);
    if(parts[0]==="invoices"&&parts[1])return handleInvoices(request,env,auth,parts[1]);
    if(parts[0]==="account-requests")return handleAccountRequest(request,env,auth);
    if(parts[0]==="account"&&parts[1]==="profile")return handleProfile(request,env,auth);
    if(parts[0]==="account"&&parts[1]==="password")return handlePasswordChange(request,env,auth);
    if(parts[0]==="member-accounts")return handleMemberAccounts(request,env,auth);
    if(parts[0]==="users"&&parts[1]&&parts[2]==="status")return handleUserStatus(request,env,auth,parts[1]);
    if(parts[0]==="users"&&parts[1]&&parts[2]==="admin-trade")return handleAdminAssignment(request,env,auth,parts[1]);
    if(parts[0]==="users"&&parts[1]&&!parts[2])return handleUserDelete(request,env,auth,parts[1]);
    return fail("Route introuvable.",404);
  } catch (error) {
    console.error("v1_api_error",error instanceof Error ? error.message : "unknown");
    return fail("Une erreur interne est survenue.",500,"internal_error");
  }
}
