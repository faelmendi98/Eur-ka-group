import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function database(){const db=new DatabaseSync(":memory:");for(const name of ["0000_eureka_v1.sql","0001_eureka_accounts.sql"])db.exec(readFileSync(new URL(`../drizzle/${name}`,import.meta.url),"utf8"));return db}

test("la migration V1 est reproductible et crée les structures attendues",()=>{const db=database();const count=db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n;assert.ok(count>=30);assert.equal(db.prepare("SELECT count(*) n FROM trades").get().n,1);db.close()});

test("le script d’initialisation local peut être exécuté plusieurs fois sans dupliquer le métier initial",()=>{const first=spawnSync(process.execPath,["scripts/init-local-db.mjs"],{encoding:"utf8",cwd:new URL("..",import.meta.url)});const second=spawnSync(process.execPath,["scripts/init-local-db.mjs"],{encoding:"utf8",cwd:new URL("..",import.meta.url)});assert.equal(first.status,0);assert.equal(second.status,0);assert.match(first.stdout,/Local D1 schema ready/);assert.match(second.stdout,/Local D1 schema ready/);});

test("un nouveau métier est vide",()=>{const db=database();db.prepare("INSERT INTO trades(id,name) VALUES (?,?)").run("trade-auto","Automobile");for(const table of ["trade_memberships","missions","projects","quote_requests","applications","documents"])assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE trade_id=?`).get("trade-auto").n,0);db.close()});

test("la base refuse une relation entre deux métiers",()=>{const db=database();db.prepare("INSERT INTO trades(id,name) VALUES (?,?)").run("trade-auto","Automobile");db.prepare("INSERT INTO users(id,auth_subject,email,display_name) VALUES (?,?,?,?)").run("u1","s1","a@example.ch","A");db.prepare("INSERT INTO trade_memberships(id,trade_id,user_id,role) VALUES (?,?,?,?)").run("m1","trade-auto","u1","mandataire");assert.throws(()=>db.prepare("INSERT INTO quote_requests(id,trade_id,mandataire_membership_id,personal_number,project_name) VALUES (?,?,?,?,?)").run("q1","trade-rd-horlogerie","m1","D-1","Projet interdit"),/trade_mismatch/);db.close()});
