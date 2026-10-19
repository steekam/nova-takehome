import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { SQL, count, eq } from 'drizzle-orm'
import { PgColumn, PgTableWithColumns } from 'drizzle-orm/pg-core'
import { InferInsertModel, InferSelectModel } from 'drizzle-orm'

type TableShape = {
  name: string
  schema: string | undefined
  columns: Record<string, PgColumn>
  dialect: 'pg'
}
type IdTable = PgTableWithColumns<TableShape> & { id: PgColumn }
type Row<TTable extends IdTable> = InferSelectModel<TTable>
type Insert<TTable extends IdTable> = InferInsertModel<TTable>
type Update<TTable extends IdTable> = Partial<Omit<Insert<TTable>, 'id'>>
type Id<TTable extends IdTable> = Row<TTable> extends { id: infer TId } ? TId : never

export interface ListOptions {
  where?: SQL
  orderBy?: SQL
  limit?: number
  offset?: number
}

/** Typed persistence primitives. Keep authorization and business rules in domain services. */
export class DrizzleCrudRepository<TTable extends IdTable> {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly table: TTable,
  ) {}

  async findById(id: Id<TTable>): Promise<Row<TTable> | undefined> {
    // Drizzle's generic .from() type also admits subqueries; the repository accepts tables only.
    const [row] = await this.db.select().from(this.table as PgTableWithColumns<TableShape>).where(eq(this.table.id, id)).limit(1)
    return row as Row<TTable> | undefined
  }

  async list(options: ListOptions = {}): Promise<Row<TTable>[]> {
    const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? 25), 100))
    const offset = Math.max(0, Math.min(Math.trunc(options.offset ?? 0), 100_000))
    let query = this.db.select().from(this.table as PgTableWithColumns<TableShape>).$dynamic()
    if (options.where) query = query.where(options.where)
    if (options.orderBy) query = query.orderBy(options.orderBy)
    const rows = await query.limit(limit).offset(offset)
    return rows as Row<TTable>[]
  }

  async create(values: Insert<TTable>): Promise<Row<TTable> | undefined> {
    const [row] = await this.db.insert(this.table).values(values).returning()
    return row as Row<TTable> | undefined
  }

  async createMany(values: Insert<TTable>[]): Promise<Row<TTable>[]> {
    if (values.length === 0) return []
    const rows = await this.db.insert(this.table).values(values).returning()
    return rows as Row<TTable>[]
  }

  async updateById(id: Id<TTable>, values: Update<TTable>): Promise<Row<TTable> | undefined> {
    const [row] = await this.db.update(this.table as PgTableWithColumns<TableShape>).set(values).where(eq(this.table.id, id)).returning()
    return row as Row<TTable> | undefined
  }

  async deleteById(id: Id<TTable>): Promise<Row<TTable> | undefined> {
    const [row] = await this.db.delete(this.table).where(eq(this.table.id, id)).returning()
    return row as Row<TTable> | undefined
  }

  async count(where?: SQL): Promise<number> {
    const query = this.db.select({ count: count() }).from(this.table as PgTableWithColumns<TableShape>)
    const [result] = where ? await query.where(where) : await query
    return result.count
  }
}
