import { count, eq } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel, SQL } from 'drizzle-orm'
import type { PgColumn, PgTable, PgTableWithColumns } from 'drizzle-orm/pg-core'
import type { DbExecutor } from '../executor'

type QueryTable = PgTableWithColumns<{
  name: string
  schema: string | undefined
  columns: Record<string, PgColumn>
  dialect: 'pg'
}>
type IdTable = PgTable & { id: PgColumn }
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
    private readonly db: DbExecutor,
    private readonly table: TTable,
  ) {}

  async findById(id: Id<TTable>, executor: DbExecutor = this.db): Promise<Row<TTable> | undefined> {
    const [row] = await executor
      .select()
      .from(this.table as unknown as QueryTable)
      .where(eq(this.table.id, id))
      .limit(1)
    return row as Row<TTable> | undefined
  }

  async list(options: ListOptions = {}, executor: DbExecutor = this.db): Promise<Row<TTable>[]> {
    const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? 25), 100))
    const offset = Math.max(0, Math.min(Math.trunc(options.offset ?? 0), 100_000))
    let query = executor
      .select()
      .from(this.table as unknown as QueryTable)
      .$dynamic()
    if (options.where) query = query.where(options.where)
    if (options.orderBy) query = query.orderBy(options.orderBy)
    const rows = await query.limit(limit).offset(offset)
    return rows as Row<TTable>[]
  }

  async create(
    values: Insert<TTable>,
    executor: DbExecutor = this.db,
  ): Promise<Row<TTable> | undefined> {
    const [row] = await executor
      .insert(this.table as unknown as QueryTable)
      .values(values as unknown as QueryTable['$inferInsert'])
      .returning()
    return row as Row<TTable> | undefined
  }

  async createMany(
    values: Insert<TTable>[],
    executor: DbExecutor = this.db,
  ): Promise<Row<TTable>[]> {
    if (values.length === 0) return []
    const rows = await executor
      .insert(this.table as unknown as QueryTable)
      .values(values as unknown as QueryTable['$inferInsert'][])
      .returning()
    return rows as Row<TTable>[]
  }

  async updateById(
    id: Id<TTable>,
    values: Update<TTable>,
    executor: DbExecutor = this.db,
  ): Promise<Row<TTable> | undefined> {
    const [row] = await executor
      .update(this.table as unknown as QueryTable)
      .set(values as QueryTable['$inferInsert'])
      .where(eq(this.table.id, id))
      .returning()
    return row as Row<TTable> | undefined
  }

  async deleteById(
    id: Id<TTable>,
    executor: DbExecutor = this.db,
  ): Promise<Row<TTable> | undefined> {
    const [row] = await executor
      .delete(this.table as unknown as QueryTable)
      .where(eq(this.table.id, id))
      .returning()
    return row as Row<TTable> | undefined
  }

  async count(where?: SQL, executor: DbExecutor = this.db): Promise<number> {
    const query = executor.select({ count: count() }).from(this.table as unknown as QueryTable)
    const [result] = where ? await query.where(where) : await query
    return result.count
  }
}
