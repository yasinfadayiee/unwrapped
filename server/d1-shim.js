// A tiny Cloudflare D1-compatible wrapper around Node's built-in SQLite, so
// the exact same Worker code runs on a plain VPS and in the test-suite.

import { DatabaseSync } from 'node:sqlite';

const returnsRows = (sql) => /^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql) || /\bRETURNING\b/i.test(sql);
const normalize = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
const plain = (row) => (row ? { ...row } : null);

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params.map(normalize));
  }
  execSync() {
    const stmt = this.db.prepare(this.sql);
    if (returnsRows(this.sql)) {
      return { success: true, results: stmt.all(...this.params).map(plain), meta: {} };
    }
    const info = stmt.run(...this.params);
    return {
      success: true,
      results: [],
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }
  async first(column) {
    const row = plain(this.db.prepare(this.sql).get(...this.params));
    if (!row) return null;
    return column ? row[column] : row;
  }
  async all() {
    return this.execSync();
  }
  async run() {
    return this.execSync();
  }
}

export class D1Shim {
  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file);
    if (file !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL');
  }
  prepare(sql) {
    return new Statement(this.db, sql);
  }
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const results = statements.map((s) => s.execSync());
      this.db.exec('COMMIT');
      return results;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
  async exec(sql) {
    this.db.exec(sql);
    return { count: 1 };
  }
}
