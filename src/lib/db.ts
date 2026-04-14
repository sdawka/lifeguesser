type Locals = App.Locals;

export function getDB(locals: Locals): D1Database {
  const db = locals.runtime?.env?.DB;
  if (!db) throw new Error('D1 database not available');
  return db;
}
