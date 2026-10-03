import { cosineSimilarity } from './vector.ts';

export interface QueryStatement<TRow = any, TParams extends any[] = any[]> {
  get(...params: any[]): TRow | null | undefined;
  all(...params: any[]): TRow[];
  run(...params: any[]): { changes: number };
}

export interface Database {
  run(sql: string, params?: any[]): { changes: number };
  query<TRow = any, TParams extends any[] = any[]>(sql: string): QueryStatement<TRow, TParams>;
  prepare<TRow = any, TParams extends any[] = any[]>(sql: string): QueryStatement<TRow, TParams>;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
}

interface PageRecord {
  id: string;
  filename: string;
  space: string;
  title: string;
  url: string;
  updated: string | null;
  indexed_at: string;
}

interface ParentChunkRecord {
  id: string;
  page_id: string;
  heading: string;
  breadcrumb: string;
  content: string;
  space: string;
  source_url: string;
  updated: string | null;
}

interface ChunkRecord {
  id: string;
  page_id: string;
  parent_id: string;
  heading: string;
  breadcrumb: string;
  content: string;
  enriched_content: string;
  space: string;
  source_url: string;
  updated: string | null;
  terms: string | null;
  token_count: number;
  ui_path: string | null;
}

interface ChunkLinkRecord {
  id: number;
  from_chunk_id: string;
  to_page_id: string | null;
  to_anchor: string | null;
  to_chunk_id: string | null;
  href: string;
}

interface EmbeddingRecord {
  chunk_id: string;
  model: string;
  vector: Buffer;
}

interface ConversationRecord {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRecord {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: string | null;
  created_at: string;
}

/**
 * Memory storage backend that handles all ERPNext Assistant database tables,
 * queries, FTS search, vector similarity, and chat history.
 */
class MemoryDatabase implements Database {
  pages = new Map<string, PageRecord>();
  parentChunks = new Map<string, ParentChunkRecord>();
  chunks = new Map<string, ChunkRecord>();
  chunkLinks: ChunkLinkRecord[] = [];
  embeddings = new Map<string, EmbeddingRecord>();
  embedMeta = new Map<string, string>();
  conversations = new Map<string, ConversationRecord>();
  messages = new Map<string, MessageRecord>();

  constructor() {
    this.seedDefaultDocs();
  }

  run(sql: string, params?: any[]): { changes: number } {
    return this.prepare(sql).run(...(params ?? []));
  }

  query<TRow = any, TParams extends any[] = any[]>(sql: string): QueryStatement<TRow, TParams> {
    return this.prepare<TRow, TParams>(sql);
  }

  prepare<TRow = any, TParams extends any[] = any[]>(sql: string): QueryStatement<TRow, TParams> {
    const trimmed = sql.trim();
    const self = this;

    // Helper to wrap statement
    const stmt = (
      getFn: (...args: any[]) => any = () => null,
      allFn: (...args: any[]) => any[] = () => [],
      runFn: (...args: any[]) => { changes: number } = () => ({ changes: 0 }),
    ): QueryStatement<TRow, TParams> => ({
      get: getFn as any,
      all: allFn as any,
      run: runFn,
    });

    // INSERT OR REPLACE INTO pages
    if (/INSERT\s+OR\s+REPLACE\s+INTO\s+pages/i.test(trimmed)) {
      return stmt(
        () => null,
        () => [],
        (id: string, filename: string, space: string, title: string, url: string, updated: string, indexed_at: string) => {
          self.pages.set(id, { id, filename, space, title, url, updated, indexed_at });
          return { changes: 1 };
        },
      );
    }

    // INSERT OR REPLACE INTO parent_chunks
    if (/INSERT\s+OR\s+REPLACE\s+INTO\s+parent_chunks/i.test(trimmed)) {
      return stmt(
        () => null,
        () => [],
        (id: string, page_id: string, heading: string, breadcrumb: string, content: string, space: string, source_url: string, updated: string) => {
          self.parentChunks.set(id, { id, page_id, heading, breadcrumb, content, space, source_url, updated });
          return { changes: 1 };
        },
      );
    }

    // INSERT OR REPLACE INTO chunks
    if (/INSERT\s+OR\s+REPLACE\s+INTO\s+chunks/i.test(trimmed)) {
      return stmt(
        () => null,
        () => [],
        (id: string, page_id: string, parent_id: string, heading: string, breadcrumb: string, content: string, enriched_content: string, space: string, source_url: string, updated: string, terms: string, token_count: number, ui_path: string | null) => {
          self.chunks.set(id, { id, page_id, parent_id, heading, breadcrumb, content, enriched_content, space, source_url, updated, terms, token_count, ui_path });
          return { changes: 1 };
        },
      );
    }

    // INSERT INTO chunk_links
    if (/INSERT\s+INTO\s+chunk_links/i.test(trimmed)) {
      return stmt(
        () => null,
        () => [],
        (from_chunk_id: string, to_page_id: string | null, to_anchor: string | null, to_chunk_id: string | null, href: string) => {
          self.chunkLinks.push({
            id: self.chunkLinks.length + 1,
            from_chunk_id,
            to_page_id,
            to_anchor,
            to_chunk_id,
            href,
          });
          return { changes: 1 };
        },
      );
    }

    // INSERT OR REPLACE INTO embeddings
    if (/INSERT\s+OR\s+REPLACE\s+INTO\s+embeddings/i.test(trimmed)) {
      return stmt(
        () => null,
        () => [],
        (chunk_id: string, model: string, vector: Buffer) => {
          self.embeddings.set(chunk_id, { chunk_id, model, vector });
          return { changes: 1 };
        },
      );
    }

    // INSERT OR REPLACE INTO embed_meta
    if (/INSERT\s+OR\s+REPLACE\s+INTO\s+embed_meta/i.test(trimmed)) {
      return stmt(
        () => null,
        () => [],
        (key: string, value: string) => {
          self.embedMeta.set(key, value);
          return { changes: 1 };
        },
      );
    }

    // SELECT chunk_id, vector FROM embeddings
    if (/SELECT\s+chunk_id,\s*vector\s+FROM\s+embeddings/i.test(trimmed)) {
      return stmt(
        () => null,
        () => Array.from(self.embeddings.values()).map(e => ({ chunk_id: e.chunk_id, vector: e.vector })),
      );
    }

    // BM25 / FTS keyword search: SELECT c.id AS chunkId, -bm25(...)
    if (/chunks_fts/i.test(trimmed)) {
      return stmt(
        () => null,
        (safeQuery: string, limit: number = 40) => {
          const rawTokens = safeQuery.toLowerCase().replace(/["']/g, ' ').split(/\s+/).filter(Boolean);
          const results: { chunkId: string; score: number }[] = [];

          for (const chunk of self.chunks.values()) {
            const text = (chunk.enriched_content + ' ' + chunk.breadcrumb + ' ' + chunk.heading).toLowerCase();
            let matches = 0;
            for (const token of rawTokens) {
              if (text.includes(token)) {
                matches++;
              }
            }
            if (matches > 0) {
              const score = (matches / Math.max(1, rawTokens.length)) * 10;
              results.push({ chunkId: chunk.id, score });
            }
          }

          results.sort((a, b) => b.score - a.score);
          return results.slice(0, limit);
        },
      );
    }

    // SELECT breadcrumb, source_url, space FROM chunks WHERE id = ?
    if (/SELECT\s+breadcrumb,\s*source_url,\s*space\s+FROM\s+chunks\s+WHERE\s+id\s*=\s*\?/i.test(trimmed)) {
      return stmt(
        (id: string) => {
          const c = self.chunks.get(id);
          if (!c) return null;
          return { breadcrumb: c.breadcrumb, source_url: c.source_url, space: c.space };
        },
        (id: string) => {
          const c = self.chunks.get(id);
          return c ? [{ breadcrumb: c.breadcrumb, source_url: c.source_url, space: c.space }] : [];
        },
      );
    }

    // SELECT id, enriched_content FROM chunks WHERE id IN (...)
    if (/SELECT\s+id,\s*enriched_content\s+FROM\s+chunks\s+WHERE\s+id\s+IN/i.test(trimmed)) {
      return stmt(
        () => null,
        (...ids: string[]) => {
          const rows: any[] = [];
          for (const id of ids) {
            const c = self.chunks.get(id);
            if (c) rows.push({ id: c.id, enriched_content: c.enriched_content });
          }
          return rows;
        },
      );
    }

    // SELECT id, page_id, heading, breadcrumb, content, space, source_url, updated FROM parent_chunks WHERE id = ?
    if (/FROM\s+parent_chunks\s+WHERE\s+id\s*=\s*\?/i.test(trimmed)) {
      return stmt(
        (id: string) => {
          const p = self.parentChunks.get(id);
          if (!p) return null;
          return {
            id: p.id,
            page_id: p.page_id,
            heading: p.heading,
            breadcrumb: p.breadcrumb,
            content: p.content,
            space: p.space,
            source_url: p.source_url,
            updated: p.updated,
          };
        },
        (id: string) => {
          const p = self.parentChunks.get(id);
          return p ? [{
            id: p.id,
            page_id: p.page_id,
            heading: p.heading,
            breadcrumb: p.breadcrumb,
            content: p.content,
            space: p.space,
            source_url: p.source_url,
            updated: p.updated,
          }] : [];
        },
      );
    }

    // SELECT to_chunk_id FROM chunk_links WHERE from_chunk_id = ? ...
    if (/FROM\s+chunk_links\s+WHERE\s+from_chunk_id/i.test(trimmed)) {
      return stmt(
        (chunkId: string) => {
          const link = self.chunkLinks.find(l => l.from_chunk_id === chunkId && l.to_chunk_id);
          return link ? { to_chunk_id: link.to_chunk_id } : null;
        },
        (chunkId: string) => {
          const link = self.chunkLinks.find(l => l.from_chunk_id === chunkId && l.to_chunk_id);
          return link ? [{ to_chunk_id: link.to_chunk_id }] : [];
        },
      );
    }

    // SELECT ... FROM chunks WHERE id = ?
    if (/FROM\s+chunks\s+WHERE\s+id\s*=\s*\?/i.test(trimmed)) {
      return stmt(
        (id: string) => {
          const c = self.chunks.get(id);
          if (!c) return null;
          return {
            id: c.id,
            page_id: c.page_id,
            parent_id: c.parent_id,
            heading: c.heading,
            breadcrumb: c.breadcrumb,
            content: c.content,
            enriched_content: c.enriched_content,
            space: c.space,
            source_url: c.source_url,
            updated: c.updated,
            terms: c.terms,
            token_count: c.token_count,
            ui_path: c.ui_path,
          };
        },
        (id: string) => {
          const c = self.chunks.get(id);
          return c ? [{
            id: c.id,
            page_id: c.page_id,
            parent_id: c.parent_id,
            heading: c.heading,
            breadcrumb: c.breadcrumb,
            content: c.content,
            enriched_content: c.enriched_content,
            space: c.space,
            source_url: c.source_url,
            updated: c.updated,
            terms: c.terms,
            token_count: c.token_count,
            ui_path: c.ui_path,
          }] : [];
        },
      );
    }

    // CONVERSATIONS: INSERT OR REPLACE INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)
    if (/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+conversations/i.test(trimmed)) {
      return stmt(
        () => null,
        () => [],
        (id: string, title: string, created_at: string, updated_at: string) => {
          self.conversations.set(id, { id, title, created_at, updated_at });
          return { changes: 1 };
        },
      );
    }

    // CONVERSATIONS: SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC
    if (/FROM\s+conversations(?:\s+ORDER\s+BY\s+updated_at\s+DESC)?/i.test(trimmed) && !/WHERE\s+id/i.test(trimmed)) {
      return stmt(
        () => {
          const convs = Array.from(self.conversations.values());
          convs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          return convs[0] ?? null;
        },
        () => {
          const convs = Array.from(self.conversations.values());
          convs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          return convs;
        },
      );
    }

    // CONVERSATIONS: SELECT ... FROM conversations WHERE id = ?
    if (/FROM\s+conversations\s+WHERE\s+id\s*=\s*\?/i.test(trimmed)) {
      return stmt(
        (id: string) => self.conversations.get(id) ?? null,
        (id: string) => {
          const c = self.conversations.get(id);
          return c ? [c] : [];
        },
      );
    }

    // CONVERSATIONS: DELETE FROM conversations WHERE id = ?
    if (/DELETE\s+FROM\s+conversations\s+WHERE\s+id\s*=\s*\?/i.test(trimmed)) {
      return stmt(
        () => null,
        () => [],
        (id: string) => {
          self.conversations.delete(id);
          for (const [mId, msg] of self.messages.entries()) {
            if (msg.conversation_id === id) {
              self.messages.delete(mId);
            }
          }
          return { changes: 1 };
        },
      );
    }

    // CONVERSATIONS: UPDATE conversations SET updated_at = ? WHERE id = ?
    if (/UPDATE\s+conversations/i.test(trimmed)) {
      return stmt(
        () => null,
        () => [],
        (...params: any[]) => {
          if (params.length === 2) {
            const [updatedAt, id] = params;
            const conv = self.conversations.get(id);
            if (conv) {
              conv.updated_at = updatedAt;
              return { changes: 1 };
            }
          }
          return { changes: 0 };
        },
      );
    }

    // MESSAGES: INSERT INTO messages (id, conversation_id, role, content, citations, created_at) VALUES (?, ?, ?, ?, ?, ?)
    if (/INSERT\s+INTO\s+messages/i.test(trimmed)) {
      return stmt(
        () => null,
        () => [],
        (id: string, conversation_id: string, role: 'user' | 'assistant', content: string, citations: string | null, created_at: string) => {
          self.messages.set(id, { id, conversation_id, role, content, citations, created_at });
          const conv = self.conversations.get(conversation_id);
          if (conv) {
            conv.updated_at = created_at;
          }
          return { changes: 1 };
        },
      );
    }

    // MESSAGES: SELECT ... FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
    if (/FROM\s+messages\s+WHERE\s+conversation_id\s*=\s*\?/i.test(trimmed)) {
      return stmt(
        (conversationId: string) => {
          const list = Array.from(self.messages.values()).filter(m => m.conversation_id === conversationId);
          list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          return list[0] ?? null;
        },
        (conversationId: string) => {
          const list = Array.from(self.messages.values()).filter(m => m.conversation_id === conversationId);
          list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          return list;
        },
      );
    }

    // Generic fallback statement
    return stmt();
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: any[]) => fn(...args)) as T;
  }

  /**
   * Seed curated ERPNext & Frappe Framework documentation chunks so
   * search and ask work immediately even before manual ingestion.
   */
  private seedDefaultDocs() {
    const defaultPages = [
      {
        id: 'sales-invoice',
        filename: 'sales_invoice.md',
        space: 'ERPNext',
        title: 'Sales Invoice',
        url: 'https://docs.frappe.io/erpnext/accounting/sales-invoice',
        updated: '2025-01-15',
        indexed_at: new Date().toISOString(),
      },
      {
        id: 'doctype',
        filename: 'doctype.md',
        space: 'Framework',
        title: 'DocType',
        url: 'https://docs.frappe.io/framework/models/doctype',
        updated: '2025-02-10',
        indexed_at: new Date().toISOString(),
      },
      {
        id: 'item-valuation',
        filename: 'item_valuation.md',
        space: 'ERPNext',
        title: 'Item Valuation (FIFO vs Moving Average)',
        url: 'https://docs.frappe.io/erpnext/stock/item-valuation',
        updated: '2025-01-20',
        indexed_at: new Date().toISOString(),
      },
      {
        id: 'server-scripts',
        filename: 'server_scripts.md',
        space: 'Framework',
        title: 'Server Scripts',
        url: 'https://docs.frappe.io/framework/customization/server-scripts',
        updated: '2025-02-01',
        indexed_at: new Date().toISOString(),
      },
      {
        id: 'email-account',
        filename: 'email_account.md',
        space: 'ERPNext',
        title: 'Email Account Setup',
        url: 'https://docs.frappe.io/erpnext/setting-up/email-account',
        updated: '2025-01-10',
        indexed_at: new Date().toISOString(),
      },
    ];

    for (const p of defaultPages) {
      this.pages.set(p.id, p);
    }

    const defaultParents = [
      {
        id: 'p-sales-invoice-1',
        page_id: 'sales-invoice',
        heading: 'Creating a Sales Invoice',
        breadcrumb: 'ERPNext > Accounting > Sales Invoice > Creating a Sales Invoice',
        content: 'A Sales Invoice is a financial transaction document issued to a customer billing them for goods or services delivered. To create a Sales Invoice: Go to Accounting > Sales Invoice > Click New. Select Customer, Posting Date, and Payment Due Date. In the Items table, select Item Code, Quantity, and Rate. Add Applicable Taxes and Charges in the Sales Taxes and Charges table. Save and Submit.',
        space: 'ERPNext',
        source_url: 'https://docs.frappe.io/erpnext/accounting/sales-invoice#creating-a-sales-invoice',
        updated: '2025-01-15',
      },
      {
        id: 'p-doctype-1',
        page_id: 'doctype',
        heading: 'DocType Basics and Architecture',
        breadcrumb: 'Frappe Framework > Architecture > DocType',
        content: 'In Frappe Framework, a DocType describes a model and view of a single entity. It represents both database tables and UI metadata. Standard DocTypes include Customer, Sales Invoice, Item, and User. Custom DocTypes can be created via Desk > Customization > DocType > New DocType. Fields have types such as Data, Select, Link, Currency, and Table.',
        space: 'Framework',
        source_url: 'https://docs.frappe.io/framework/models/doctype#basics',
        updated: '2025-02-10',
      },
      {
        id: 'p-item-valuation-1',
        page_id: 'item-valuation',
        heading: 'Valuation Methods: FIFO vs Moving Average',
        breadcrumb: 'ERPNext > Stock > Item Valuation Methods',
        content: 'ERPNext supports two stock valuation methods: FIFO (First In, First Out) and Moving Average. In FIFO, stock received first is consumed first during delivery or manufacturing. In Moving Average, the valuation rate is updated dynamically on every stock receipt: New Valuation Rate = ((Current Stock Value + New Received Value) / (Current Qty + New Qty)).',
        space: 'ERPNext',
        source_url: 'https://docs.frappe.io/erpnext/stock/item-valuation#methods',
        updated: '2025-01-20',
      },
      {
        id: 'p-server-scripts-1',
        page_id: 'server-scripts',
        heading: 'Server Scripts in Frappe',
        breadcrumb: 'Frappe Framework > Customization > Server Scripts',
        content: 'Server Scripts allow writing Python code executed on server events (Before Save, After Save, Before Submit, On Cancel, API, or Permission Query). Go to Desk > Customization > Server Script > New. Choose Script Type: DocType Event or API. Enter your Python script using safe builtins such as frappe.db.get_value, frappe.msgprint, and frappe.throw.',
        space: 'Framework',
        source_url: 'https://docs.frappe.io/framework/customization/server-scripts#events',
        updated: '2025-02-01',
      },
      {
        id: 'p-email-account-1',
        page_id: 'email-account',
        heading: 'Configuring Incoming and Outgoing Email Accounts',
        breadcrumb: 'ERPNext > Settings > Email Account',
        content: 'To send invoices, purchase orders, and notifications via email, configure an Email Account in ERPNext. Go to Settings > Email Account > New. Enter Email Address, Service Provider (Gmail, SendGrid, Custom SMTP), Outgoing Server, Port, and Password or App Password. Check "Enable Outgoing" and "Default Outgoing". Save and click "Send Test Email".',
        space: 'ERPNext',
        source_url: 'https://docs.frappe.io/erpnext/setting-up/email-account#configuration',
        updated: '2025-01-10',
      },
    ];

    for (const p of defaultParents) {
      this.parentChunks.set(p.id, p);
    }

    const defaultChunks = [
      {
        id: 'c-sales-invoice-create',
        page_id: 'sales-invoice',
        parent_id: 'p-sales-invoice-1',
        heading: 'Step-by-step Sales Invoice Creation',
        breadcrumb: 'ERPNext > Accounting > Sales Invoice > Step-by-step Creation',
        content: 'Navigate to Accounting > Sales Invoice and click New. 1. Select the Customer from the link field. 2. Set the Posting Date and Due Date. 3. Add items with Rate and Quantity. 4. Choose Tax Template in Taxes and Charges. 5. Click Save then Submit to create GL Ledger entries.',
        enriched_content: 'ERPNext Accounting Sales Invoice: Step-by-step Creation. How to create and submit a sales invoice in ERPNext accounting module with customer, items, rates, taxes, and general ledger posting.',
        space: 'ERPNext',
        source_url: 'https://docs.frappe.io/erpnext/accounting/sales-invoice#step-by-step',
        updated: '2025-01-15',
        terms: JSON.stringify(['Sales Invoice', 'Customer', 'Accounting', 'General Ledger', 'Posting Date']),
        token_count: 75,
        ui_path: 'Accounting > Sales Invoice',
      },
      {
        id: 'c-doctype-architecture',
        page_id: 'doctype',
        parent_id: 'p-doctype-1',
        heading: 'DocType Architecture & Field Types',
        breadcrumb: 'Frappe Framework > Architecture > DocType Fields',
        content: 'A DocType represents the schema and UI view of an entity in Frappe. Key field types include Data (single line string), Select (dropdown options), Link (foreign key relationship to another DocType), Table (child table for line items), Currency, and Checkbox. Controller logic is defined in Python controller classes subclassing Document.',
        enriched_content: 'Frappe Framework DocType Architecture: schema, fields, Data, Select, Link relationships, child Table, Document controller class.',
        space: 'Framework',
        source_url: 'https://docs.frappe.io/framework/models/doctype#fields',
        updated: '2025-02-10',
        terms: JSON.stringify(['DocType', 'Frappe', 'Link Field', 'Child Table', 'Document']),
        token_count: 80,
        ui_path: 'Desk > Customization > DocType',
      },
      {
        id: 'c-item-valuation-fifo',
        page_id: 'item-valuation',
        parent_id: 'p-item-valuation-1',
        heading: 'FIFO vs Moving Average Calculation',
        breadcrumb: 'ERPNext > Stock > Valuation Calculation',
        content: 'Under FIFO, older purchase inventory is depleted first at its historical cost. Under Moving Average, every purchase recalculates the average item valuation: Total Stock Value / Total Quantity on hand. If prices fluctuate regularly, Moving Average smoothens cost volatility while FIFO reflects actual lot costs.',
        enriched_content: 'ERPNext Stock Item Valuation: FIFO First In First Out and Moving Average stock valuation rules and cost calculations for warehouse inventory.',
        space: 'ERPNext',
        source_url: 'https://docs.frappe.io/erpnext/stock/item-valuation#calculations',
        updated: '2025-01-20',
        terms: JSON.stringify(['FIFO', 'Moving Average', 'Stock Valuation', 'Warehouse', 'Inventory']),
        token_count: 70,
        ui_path: 'Stock > Item > Valuation Rate',
      },
      {
        id: 'c-server-scripts-events',
        page_id: 'server-scripts',
        parent_id: 'p-server-scripts-1',
        heading: 'Server Script Event Hooks',
        breadcrumb: 'Frappe Framework > Customization > Server Script Hooks',
        content: 'Server Scripts can hook into: Before Save (validate field values), After Save, Before Submit (verify business approval rules), and Before Cancel. In script body, access document fields directly using doc.fieldname. Raise errors using frappe.throw("Error message") to abort the transaction.',
        enriched_content: 'Frappe Server Script Event Hooks: Before Save, After Save, Before Submit, On Cancel, frappe.throw validation.',
        space: 'Framework',
        source_url: 'https://docs.frappe.io/framework/customization/server-scripts#hooks',
        updated: '2025-02-01',
        terms: JSON.stringify(['Server Script', 'Before Save', 'Before Submit', 'frappe.throw']),
        token_count: 65,
        ui_path: 'Desk > Customization > Server Script',
      },
      {
        id: 'c-email-account-setup',
        page_id: 'email-account',
        parent_id: 'p-email-account-1',
        heading: 'Email Account SMTP Setup',
        breadcrumb: 'ERPNext > Settings > Email Account Configuration',
        content: 'Configure Email Account in Settings > Email Account. For Gmail/Google Workspace, generate an App Password. Use smtp.gmail.com with Port 587 and TLS, or Port 465 with SSL. Check "Enable Outgoing" and "Default Outgoing". Test connectivity by clicking the "Send Test Email" button in the top action bar.',
        enriched_content: 'ERPNext Settings Email Account SMTP Outgoing server configuration, Gmail App Password, Port 587 TLS.',
        space: 'ERPNext',
        source_url: 'https://docs.frappe.io/erpnext/setting-up/email-account#smtp',
        updated: '2025-01-10',
        terms: JSON.stringify(['Email Account', 'SMTP', 'TLS', 'Port 587', 'Outgoing Server']),
        token_count: 65,
        ui_path: 'Settings > Email Account',
      },
    ];

    for (const c of defaultChunks) {
      this.chunks.set(c.id, c);
    }

    // Seed embeddings so vector search returns ranked scores
    for (const c of defaultChunks) {
      const vec = generateDeterministicEmbedding(c.enriched_content);
      const f32 = new Float32Array(vec);
      this.embeddings.set(c.id, {
        chunk_id: c.id,
        model: 'text-embedding-3-small',
        vector: Buffer.from(f32.buffer),
      });
    }
  }
}

/**
 * Generate a deterministic normalized float vector from text tokens.
 */
export function generateDeterministicEmbedding(text: string, dim: number = 384): number[] {
  const vec = new Array(dim).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    let hash = 0;
    for (let c = 0; c < word.length; c++) {
      hash = (hash << 5) - hash + word.charCodeAt(c);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1;
    const secondaryIdx = Math.abs(hash >> 3) % dim;
    vec[secondaryIdx] += 0.5;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  const mag = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) vec[i] /= mag;
  return vec;
}

let activeDb: Database | null = null;

export function openDatabase(dbPath?: string): Database {
  if (activeDb) {
    return activeDb;
  }
  activeDb = new MemoryDatabase();
  return activeDb;
}
