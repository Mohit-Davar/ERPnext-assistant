import express from 'express';
import { generateAnswerStream } from './src/answer/index.ts';
import { extractAndVerifyCitations } from './src/answer/citations.ts';
import { expandResults } from './src/expand/index.ts';
import {
  addMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
} from './src/history/index.ts';
import { openDatabase } from './src/index/database.ts';
import { ingest, search } from './src/pipeline.ts';
import { hybridRetrieve } from './src/retrieve/index.ts';
import { loadConfig } from './src/shared/config.ts';

const app = express();
const PORT = 3000;
const config = loadConfig();
const db = openDatabase(config.dbPath);

app.use(express.json());

// API: Search
app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });
    const results = await search(query, 10);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// API: Conversations list
app.get('/api/history', (req, res) => {
  try {
    const list = listConversations(db);
    res.json({ conversations: list });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// API: Conversation details
app.get('/api/history/:id', (req, res) => {
  try {
    const conv = getConversation(db, req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// API: Delete conversation
app.delete('/api/history/:id', (req, res) => {
  try {
    deleteConversation(db, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// API: Ingest
app.post('/api/ingest', async (req, res) => {
  try {
    const logs: string[] = [];
    const result = await ingest((msg) => {
      logs.push(msg);
    });
    res.json({ result, logs });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// API: Ask (Streaming or SSE)
app.post('/api/ask', async (req, res) => {
  try {
    const { question, conversationId } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });

    let activeConvId = conversationId;
    if (!activeConvId) {
      const newConv = createConversation(db, question);
      activeConvId = newConv.id;
    }

    addMessage(db, activeConvId, 'user', question);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Notify client of conversationId
    res.write(`data: ${JSON.stringify({ type: 'start', conversationId: activeConvId })}\n\n`);

    // Retrieval
    const reranked = await hybridRetrieve(db, question, config, 15);
    const contexts = expandResults(db, reranked);

    // Load history for context
    const conv = getConversation(db, activeConvId);
    const history = (conv?.messages ?? []).map((m) => ({ role: m.role, content: m.content }));

    const stream = generateAnswerStream(question, contexts, config, history);
    let fullText = '';

    let step = await stream.next();
    while (!step.done) {
      fullText += step.value;
      res.write(`data: ${JSON.stringify({ type: 'chunk', delta: step.value })}\n\n`);
      step = await stream.next();
    }

    const { citations } = extractAndVerifyCitations(fullText, contexts);
    const finalAnswer = step.value;
    const finalCitations = citations.length > 0 ? citations : finalAnswer.citations;

    addMessage(db, activeConvId, 'assistant', fullText, finalCitations);

    res.write(`data: ${JSON.stringify({ type: 'done', citations: finalCitations, fullText })}\n\n`);
    res.end();
  } catch (err) {
    res.write(
      `data: ${JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : String(err) })}\n\n`,
    );
    res.end();
  }
});

// Serve web interface mirroring the terminal TUI
app.use((req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ERPNext Assistant</title>
  <meta name="description" content="AI-powered documentation assistant, hybrid search, and RAG ingestion pipeline for ERPNext and Frappe Framework.">
  <meta property="og:title" content="ERPNext Assistant">
  <meta property="og:description" content="AI-powered documentation assistant, hybrid search, and RAG ingestion pipeline for ERPNext and Frappe Framework.">
  <style>
    :root {
      --bg: #0c0e14;
      --card-bg: #141722;
      --border: #232838;
      --text: #e2e8f0;
      --text-dim: #718096;
      --cyan: #38bdf8;
      --green: #4ade80;
      --yellow: #facc15;
      --red: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, Menlo, Monaco, Consolas, monospace;
      padding: 1.5rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .container {
      max-width: 960px;
      width: 100%;
      margin: 0 auto;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.75rem;
      margin-bottom: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      font-size: 1.15rem;
      font-weight: bold;
      color: var(--cyan);
    }
    .badge {
      font-size: 0.75rem;
      padding: 0.2rem 0.5rem;
      background: #1e293b;
      border-radius: 4px;
      color: var(--text-dim);
    }
    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.75rem;
    }
    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-dim);
      padding: 0.4rem 1rem;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .tab-btn:hover {
      color: var(--text);
    }
    .tab-btn.active {
      background: var(--cyan);
      color: #000;
      font-weight: bold;
    }
    .view-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      margin-bottom: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      min-height: 250px;
    }
    .msg-user {
      border-left: 3px solid var(--cyan);
      padding-left: 0.75rem;
    }
    .msg-user .role { color: var(--cyan); font-weight: bold; margin-bottom: 0.25rem; font-size: 0.85rem; }
    .msg-assistant {
      border-left: 3px solid var(--green);
      padding-left: 0.75rem;
    }
    .msg-assistant .role { color: var(--green); font-weight: bold; margin-bottom: 0.25rem; font-size: 0.85rem; }
    .citations-box {
      margin-top: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: var(--card-bg);
      border-left: 2px solid #334155;
      font-size: 0.8rem;
    }
    .cite-badge { color: var(--cyan); font-weight: bold; }
    .input-box {
      display: flex;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.5rem 0.75rem;
      align-items: center;
    }
    .input-box:focus-within {
      border-color: var(--cyan);
    }
    .input-box input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text);
      font-family: inherit;
      font-size: 0.95rem;
      outline: none;
      padding-left: 0.5rem;
    }
    .input-prefix { color: var(--cyan); font-weight: bold; }
    .footer-bar {
      margin-top: 1.5rem;
      border-top: 1px solid var(--border);
      padding-top: 0.75rem;
      display: flex;
      justify-content: space-between;
      color: var(--text-dim);
      font-size: 0.8rem;
    }
    .btn {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.4rem 0.8rem;
      font-family: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .btn:hover { border-color: var(--cyan); }
    .btn-primary { background: var(--cyan); color: #000; font-weight: bold; border-color: var(--cyan); }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 1rem;
      margin-bottom: 0.75rem;
    }
    .card:hover { border-color: var(--cyan); }
    .card-title { font-weight: bold; color: var(--cyan); margin-bottom: 0.25rem; }
    .score-badge { color: var(--green); font-size: 0.85rem; }
    .space-badge { color: var(--yellow); font-size: 0.85rem; }
    .history-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background: var(--card-bg);
      border: 1px solid var(--border);
      margin-bottom: 0.5rem;
      cursor: pointer;
    }
    .history-item:hover { border-color: var(--cyan); }
    .history-item.active { border-color: var(--cyan); background: #1a2234; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <span class="logo">◈ ERPNext Assistant</span>
        <span style="color: var(--text-dim); margin-left: 0.5rem;">│ Documentation RAG & Search</span>
      </div>
      <div class="badge">CLI & Web TUI</div>
    </header>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('ask')">[ 1. Ask ]</button>
      <button class="tab-btn" onclick="switchTab('search')">[ 2. Search ]</button>
      <button class="tab-btn" onclick="switchTab('ingest')">[ 3. Ingest ]</button>
      <button class="tab-btn" onclick="switchTab('history')">[ 4. History ]</button>
    </div>

    <!-- ASK VIEW -->
    <div id="tab-ask" class="view-content">
      <div id="chat-messages" class="chat-messages">
        <div style="color: var(--text-dim); padding: 1rem 0;">
          Ask any question about ERPNext or Frappe Framework documentation.
          <div style="margin-top: 0.75rem; font-size: 0.85rem;">
            Suggestions:<br>
            • How to create a Sales Invoice in ERPNext?<br>
            • What is a DocType in Frappe Framework?<br>
            • Item valuation methods: FIFO vs Moving Average?<br>
            • How to configure Email Accounts?
          </div>
        </div>
      </div>

      <div class="input-box">
        <span class="input-prefix">?</span>
        <input type="text" id="ask-input" placeholder="Ask a question about ERPNext or Frappe documentation..." onkeydown="if(event.key==='Enter') submitAsk()">
        <button class="btn btn-primary" onclick="submitAsk()" style="margin-left: 0.5rem;">Send</button>
      </div>
    </div>

    <!-- SEARCH VIEW -->
    <div id="tab-search" class="view-content" style="display: none;">
      <div class="input-box" style="margin-bottom: 1rem;">
        <span class="input-prefix">⌕</span>
        <input type="text" id="search-input" placeholder="Search documentation chunks (e.g., Sales Invoice, DocType, valuation)..." onkeydown="if(event.key==='Enter') submitSearch()">
        <button class="btn btn-primary" onclick="submitSearch()" style="margin-left: 0.5rem;">Search</button>
      </div>

      <div id="search-results"></div>
    </div>

    <!-- INGEST VIEW -->
    <div id="tab-ingest" class="view-content" style="display: none;">
      <div style="margin-bottom: 1.5rem; color: var(--text-dim); font-size: 0.9rem;">
        The Ingestion Pipeline parses Markdown documents from the <code>docs/</code> folder, segments them into parent sections and searchable child chunks, enriches breadcrumbs, generates vector embeddings, and builds BM25 full-text indexes.
      </div>
      <div style="margin-bottom: 1.5rem;">
        <button class="btn btn-primary" id="btn-ingest" onclick="submitIngest()">▶ Run Documentation Ingestion</button>
      </div>
      <div id="ingest-status"></div>
    </div>

    <!-- HISTORY VIEW -->
    <div id="tab-history" class="view-content" style="display: none;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
        <span style="font-weight: bold;">Conversation History</span>
        <button class="btn" onclick="newConversation()">+ New Conversation</button>
      </div>
      <div id="history-list"></div>
    </div>

    <footer class="footer-bar">
      <div>
        <span style="color: var(--cyan);">Keyboard:</span> [1-4] Switch Tab │ [Enter] Submit │ [Esc] Clear
      </div>
      <div>
        Status: <span style="color: var(--green);">Ready</span>
      </div>
    </footer>
  </div>

  <script>
    let activeConversationId = null;
    let isBusy = false;

    function switchTab(name) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.view-content').forEach(el => el.style.display = 'none');
      
      const tabMap = { ask: 0, search: 1, ingest: 2, history: 3 };
      document.querySelectorAll('.tab-btn')[tabMap[name]].classList.add('active');
      document.getElementById('tab-' + name).style.display = 'flex';

      if (name === 'history') loadHistory();
    }

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') {
        if (e.key === 'Escape') document.activeElement.blur();
        return;
      }
      if (e.key === '1') switchTab('ask');
      if (e.key === '2') switchTab('search');
      if (e.key === '3') switchTab('ingest');
      if (e.key === '4') switchTab('history');
    });

    async function submitAsk() {
      const input = document.getElementById('ask-input');
      const question = input.value.trim();
      if (!question || isBusy) return;

      input.value = '';
      isBusy = true;

      const chatContainer = document.getElementById('chat-messages');
      
      // User message
      const userDiv = document.createElement('div');
      userDiv.className = 'msg-user';
      userDiv.innerHTML = '<div class="role">&gt; You</div><div>' + escapeHtml(question) + '</div>';
      chatContainer.appendChild(userDiv);

      // Assistant message placeholder
      const asstDiv = document.createElement('div');
      asstDiv.className = 'msg-assistant';
      asstDiv.innerHTML = '<div class="role">◈ Assistant</div><div class="content" style="color: var(--yellow);">Retrieving relevant documentation and generating response...</div>';
      chatContainer.appendChild(asstDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;

      const contentEl = asstDiv.querySelector('.content');

      try {
        const response = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, conversationId: activeConversationId })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let citations = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'start') {
                  activeConversationId = data.conversationId;
                  contentEl.style.color = 'var(--text)';
                  contentEl.textContent = '';
                } else if (data.type === 'chunk') {
                  accumulated += data.delta;
                  contentEl.textContent = accumulated;
                  chatContainer.scrollTop = chatContainer.scrollHeight;
                } else if (data.type === 'done') {
                  citations = data.citations || [];
                }
              } catch (_) {}
            }
          }
        }

        if (citations && citations.length > 0) {
          const citeDiv = document.createElement('div');
          citeDiv.className = 'citations-box';
          citeDiv.innerHTML = '<div style="color: var(--text-dim); margin-bottom: 0.25rem;">Sources:</div>' +
            citations.map(c => '<div><span class="cite-badge">[' + c.index + ']</span> ' + escapeHtml(c.section) + (c.url ? ' <span style="color: var(--text-dim)">' + escapeHtml(c.url) + '</span>' : '') + '</div>').join('');
          asstDiv.appendChild(citeDiv);
        }

      } catch (err) {
        contentEl.textContent = 'Error: ' + err.message;
        contentEl.style.color = 'var(--red)';
      } finally {
        isBusy = false;
      }
    }

    async function submitSearch() {
      const input = document.getElementById('search-input');
      const query = input.value.trim();
      if (!query) return;

      const container = document.getElementById('search-results');
      container.innerHTML = '<div style="color: var(--yellow);">Searching documentation chunks...</div>';

      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          container.innerHTML = data.results.map((r, i) => \`
            <div class="card">
              <div style="display: flex; justify-content: space-between;">
                <div class="card-title">\${i + 1}. \${escapeHtml(r.breadcrumb)}</div>
                <div>
                  <span class="score-badge">Score: \${r.rerankScore.toFixed(3)}</span>
                  <span class="space-badge">[\${r.space}]</span>
                </div>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-dim); margin-top: 0.5rem; line-height: 1.4;">
                \${escapeHtml(r.content)}
              </div>
              \${r.source_url ? \`<div style="font-size: 0.75rem; color: #475569; margin-top: 0.5rem;">\${escapeHtml(r.source_url)}</div>\` : ''}
            </div>
          \`).join('');
        } else {
          container.innerHTML = '<div style="color: var(--yellow);">No matching documentation found.</div>';
        }
      } catch (err) {
        container.innerHTML = '<div style="color: var(--red);">Error: ' + err.message + '</div>';
      }
    }

    async function submitIngest() {
      const btn = document.getElementById('btn-ingest');
      const statusEl = document.getElementById('ingest-status');
      btn.disabled = true;
      statusEl.innerHTML = '<div style="color: var(--yellow);">Running documentation ingestion...</div>';

      try {
        const res = await fetch('/api/ingest', { method: 'POST' });
        const data = await res.json();
        if (data.result) {
          const r = data.result;
          statusEl.innerHTML = \`
            <div class="card" style="border-color: var(--green);">
              <div style="color: var(--green); font-weight: bold; margin-bottom: 0.75rem;">✔ Ingestion Completed Successfully</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.85rem;">
                <div>Changed Documents: <b>\${r.changed}</b></div>
                <div>Unchanged Documents: <b>\${r.unchanged}</b></div>
                <div>Parsed Pages: <b>\${r.parsed}</b></div>
                <div>Parent Sections: <b>\${r.parents}</b></div>
                <div>Child Search Chunks: <b>\${r.children}</b></div>
                <div>Enriched Chunks: <b>\${r.enriched}</b></div>
                <div>Indexed Links: <b>\${r.links}</b></div>
              </div>
            </div>
          \`;
        }
      } catch (err) {
        statusEl.innerHTML = '<div style="color: var(--red);">Error: ' + err.message + '</div>';
      } finally {
        btn.disabled = false;
      }
    }

    async function loadHistory() {
      const listEl = document.getElementById('history-list');
      listEl.innerHTML = '<div style="color: var(--text-dim);">Loading conversations...</div>';

      try {
        const res = await fetch('/api/history');
        const data = await res.json();
        if (data.conversations && data.conversations.length > 0) {
          listEl.innerHTML = data.conversations.map(c => \`
            <div class="history-item \${c.id === activeConversationId ? 'active' : ''}" onclick="openConversation('\${c.id}')">
              <div>
                <div style="font-weight: bold; color: var(--text);">\${escapeHtml(c.title)}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.2rem;">\${c.messageCount || 0} messages │ \${new Date(c.updatedAt).toLocaleString()}</div>
              </div>
              <div>
                <button class="btn" onclick="event.stopPropagation(); deleteConv('\${c.id}')" style="color: var(--red);">Delete</button>
              </div>
            </div>
          \`).join('');
        } else {
          listEl.innerHTML = '<div style="color: var(--text-dim);">No conversation history yet. Start a new conversation in the Ask tab.</div>';
        }
      } catch (err) {
        listEl.innerHTML = '<div style="color: var(--red);">Error: ' + err.message + '</div>';
      }
    }

    async function openConversation(id) {
      activeConversationId = id;
      try {
        const res = await fetch('/api/history/' + id);
        const conv = await res.json();
        const chatContainer = document.getElementById('chat-messages');
        chatContainer.innerHTML = '';

        if (conv.messages) {
          for (const m of conv.messages) {
            const div = document.createElement('div');
            div.className = m.role === 'user' ? 'msg-user' : 'msg-assistant';
            div.innerHTML = '<div class="role">' + (m.role === 'user' ? '&gt; You' : '◈ Assistant') + '</div><div>' + escapeHtml(m.content) + '</div>';
            
            if (m.citations && m.citations.length > 0) {
              const citeDiv = document.createElement('div');
              citeDiv.className = 'citations-box';
              citeDiv.innerHTML = '<div style="color: var(--text-dim); margin-bottom: 0.25rem;">Sources:</div>' +
                m.citations.map(c => '<div><span class="cite-badge">[' + c.index + ']</span> ' + escapeHtml(c.section) + '</div>').join('');
              div.appendChild(citeDiv);
            }
            chatContainer.appendChild(div);
          }
        }
        switchTab('ask');
      } catch (err) {
        alert('Could not load conversation: ' + err.message);
      }
    }

    function newConversation() {
      activeConversationId = null;
      document.getElementById('chat-messages').innerHTML = '<div style="color: var(--text-dim); padding: 1rem 0;">New conversation started. Ask any question about ERPNext or Frappe documentation.</div>';
      switchTab('ask');
    }

    async function deleteConv(id) {
      if (confirm('Delete this conversation?')) {
        await fetch('/api/history/' + id, { method: 'DELETE' });
        if (activeConversationId === id) newConversation();
        loadHistory();
      }
    }

    function escapeHtml(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ERPNext Assistant server running on http://0.0.0.0:${PORT}`);
});
