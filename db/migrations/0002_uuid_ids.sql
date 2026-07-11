-- ============================================================
--  PK/FK を INTEGER AUTOINCREMENT から TEXT(UUID) へ移行する。
--
--   id の値は再割り当てできず（既存の数値 id ↔ 新 UUID の対応が作れない）、
--  既存データは破棄してよい方針のため、対象テーブルを一度 DROP し、
--  openDb()（schema.sql）で UUID スキーマとして作り直したうえで seed し直す。
--    実行手順:  sqlite3 data/travel.db < db/migrations/0002_uuid_ids.sql
--               node db/seed.ts --reset
--
--  trip（id=1 固定の単一行）と chat_sessions（既に TEXT UUID）は対象外。
-- ============================================================
PRAGMA foreign_keys=OFF;
BEGIN;
DROP TABLE IF EXISTS spot_place_cache;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS days;
DROP TABLE IF EXISTS legs;
DROP TABLE IF EXISTS route;
DROP TABLE IF EXISTS budget;
DROP TABLE IF EXISTS spots;
DELETE FROM sqlite_sequence;
COMMIT;
PRAGMA foreign_keys=ON;
